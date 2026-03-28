// backend/src/services/lingkunganService.ts
import { Op } from 'sequelize';
import { Device, Area } from '../../../db/models';
import LingkunganLog from '../models/lingkunganLog';
import PredictionResult from '../models/predictionResult';
import { DeviceAttributes } from '../../../db/models/device';
import { AcknowledgeStatus } from '../models/lingkunganLog';
import ApiError from '../../../utils/apiError';
import { client as mqttClient } from '../../../mqtt/client';
import * as lingkunganAlertingService from './lingkunganAlertingService';
import { sequelize } from '../../../db/config';

// MQTT topics for ML prediction pipeline
const ML_PREDICT_REQUEST_TOPIC = 'synergy/ml/predict/request';

// Safety thresholds (Level 2 — firmware safety)
const SAFE_TEMP = 30;
const SAFE_HUMIDITY = 75;
const SAFE_CO2 = 1200;

// Predictive thresholds (Level 3 — ML-driven)
const PREDICT_TEMP_THRESHOLD = 35;
const PREDICT_HUMIDITY_THRESHOLD = 80;
const PREDICT_CO2_THRESHOLD = 1500;

// Failsafe thresholds (Level 3 — Actual readings missing predictions)
const FAILSAFE_TEMP_THRESHOLD = 34;
const FAILSAFE_HUMIDITY_THRESHOLD = 79;
const FAILSAFE_CO2_THRESHOLD = 1450;

// ML v3 expects 240 samples (15s interval x 1 hour)
const ML_SEQUENCE_LENGTH = 240;

// Manual override duration (5 minutes)
const MANUAL_OVERRIDE_DURATION_MS = 5 * 60 * 1000;

/**
 * Ingest raw sensor data from MQTT and trigger ML prediction pipeline.
 */
export const ingestSensorData = async (data: {
  device_id: string;
  temperature: number;
  humidity: number;
  co2: number;
}) => {
  // 1. Save raw sensor data
  const log = await LingkunganLog.create({
    device_id: data.device_id,
    temperature: data.temperature,
    humidity: data.humidity,
    co2: data.co2
  });

  console.log(
    `[LingkunganService] Ingested sensor data: T=${data.temperature}°C, H=${data.humidity}%, CO2=${data.co2}ppm for device ${data.device_id}`
  );

  // 2. Fetch device once, share across all downstream calls
  const device = await Device.findByPk(data.device_id, {
    include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
  });

  if (!device) {
    console.error(`[LingkunganService] Device ${data.device_id} not found`);
    return log;
  }

  // 3. Update device with latest sensor readings
  await device.update({
    last_temperature: data.temperature,
    last_humidity: data.humidity,
    last_co2: data.co2
  });

  // 4. Trigger ML prediction (non-blocking)
  triggerPrediction(data.device_id, device).catch((err) => {
    console.error('[LingkunganService] ML prediction failed:', err.message);
  });

  // 5. Check actual thresholds for notifications and ML override (Level 3 - Actual)
  await handleActualThresholdControl(data, device);

  // 6. Check firmware safety thresholds (Level 2)
  await handleFirmwareSafetyCheck(data, device);

  return log;
};

/**
 * Trigger ML prediction by publishing a request to the ML server via MQTT.
 * The ML server subscribes to 'synergy/ml/predict/request', runs inference,
 * and publishes the result to 'synergy/ml/predict/response/{deviceId}'.
 * The response is handled asynchronously in handlePredictionResult().
 */
const triggerPrediction = async (deviceId: string, device: Device) => {
  try {
    const totalLogs = await LingkunganLog.count({
      where: { device_id: deviceId }
    });

    // Only trigger prediction when we have at least 1 full hour of data.
    if (totalLogs < ML_SEQUENCE_LENGTH) {
      console.log(
        `[LingkunganService] Not enough data for prediction (${totalLogs}/${ML_SEQUENCE_LENGTH}). Skipping.`
      );
      return;
    }

    // Get the latest ML_SEQUENCE_LENGTH readings then reverse to oldest-first.
    const recentData = await LingkunganLog.findAll({
      where: { device_id: deviceId },
      order: [['timestamp', 'DESC']],
      limit: ML_SEQUENCE_LENGTH
    });

    const sequence = recentData.reverse().map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2: r.co2,
      timestamp: r.timestamp.toISOString(),
      status_kipas: device.fan_state === 'ON' ? 1 : 0,
      status_dehumidifier: device.dehumidifier_state === 'ON' ? 1 : 0
    }));

    // Publish prediction request to ML server via MQTT
    const payload = JSON.stringify({
      device_id: deviceId,
      sequence
    });

    mqttClient.publish(ML_PREDICT_REQUEST_TOPIC, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(
          `[LingkunganService] Failed to publish ML prediction request for ${deviceId}:`,
          err
        );
      } else {
        console.log(
          `[LingkunganService] ML prediction request published for device ${deviceId}`
        );
      }
    });
  } catch (error: any) {
    console.error(
      '[LingkunganService] ML prediction request error:',
      error.message
    );
  }
};

/**
 * Handle the ML prediction result received via MQTT.
 * Called from the MQTT client when a message arrives on
 * 'synergy/ml/predict/response/{deviceId}'.
 */
export const handlePredictionResult = async (
  deviceId: string,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
    error?: string;
  }
) => {
  try {
    // Check for ML server error
    if (prediction.error) {
      console.error(
        `[LingkunganService] ML server returned error for ${deviceId}: ${prediction.error}`
      );
      return;
    }

    // Compute forecasted timestamp: latest data point + 15 minutes
    // This reflects the actual time the model is predicting for, not when the inference ran.
    const latestLog = await LingkunganLog.findOne({
      where: { device_id: deviceId },
      order: [['timestamp', 'DESC']]
    });
    const forecastedAt = latestLog
      ? new Date(latestLog.timestamp.getTime() + 15 * 60 * 1000)
      : new Date(Date.now() + 15 * 60 * 1000);

    // Save prediction result
    const predResult = await PredictionResult.create({
      device_id: deviceId,
      predicted_temperature: prediction.predicted_temperature,
      predicted_humidity: prediction.predicted_humidity,
      predicted_co2: prediction.predicted_co2,
      timestamp: forecastedAt
    });

    console.log(
      `[LingkunganService] Prediction saved: T=${prediction.predicted_temperature}°C, H=${prediction.predicted_humidity}%, CO2=${prediction.predicted_co2}ppm`
    );

    // Check predictive thresholds (Level 3 - Actuators)
    await handlePredictiveControl(deviceId, prediction);

    return predResult;
  } catch (error: any) {
    console.error(
      '[LingkunganService] Error handling prediction result:',
      error.message
    );
  }
};

/**
 * Level 2: Firmware safety check — turn OFF actuators if below safe thresholds.
 */
const handleFirmwareSafetyCheck = async (
  data: {
    device_id: string;
    temperature: number;
    humidity: number;
    co2: number;
  },
  _device: Device
) => {
  // If ALL readings are below safe thresholds, turn off actuators
  if (
    data.temperature < SAFE_TEMP &&
    data.humidity < SAFE_HUMIDITY &&
    data.co2 < SAFE_CO2
  ) {
    // Re-read device to get fresh control_mode (avoid stale data race)
    const freshDevice = await Device.findByPk(data.device_id, {
      include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
    });
    if (!freshDevice) return;

    // Check if in manual override mode
    if (freshDevice.control_mode === 'MANUAL') {
      const overrideUntil = freshDevice.manual_override_until;
      if (!overrideUntil || new Date(overrideUntil) > new Date()) {
        console.log(
          '[LingkunganService] Manual override active. Skipping safety deactivation.'
        );
        return;
      }
      // Override expired, switch back to auto
      await freshDevice.update({
        control_mode: 'AUTO',
        manual_override_until: null
      });
    }

    // Turn off actuators via MQTT
    if (
      freshDevice.fan_state === 'ON' ||
      freshDevice.dehumidifier_state === 'ON'
    ) {
      console.log(
        '[LingkunganService] Safety thresholds clear. Turning off actuators.'
      );
      await sendActuatorCommand(
        data.device_id,
        {
          fan: 'OFF',
          dehumidifier: 'OFF'
        },
        freshDevice
      );
      await freshDevice.update({
        fan_state: 'OFF',
        dehumidifier_state: 'OFF'
      });

      // Send recovery notification
      await lingkunganAlertingService.processLingkunganAlert(
        data.device_id,
        ['Kondisi lingkungan kembali stabil. Aktuator dinonaktifkan.'],
        data,
        'RECOVERY'
      );
    }
  }
};

/**
 * Level 3: Predictive & Early Warning — activate actuators based on ML forecast.
 * Notifikasi hanya dikirim saat ada perubahan state aktuator (OFF -> ON).
 */
const handlePredictiveControl = async (
  deviceId: string,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
  }
) => {
  const device = await Device.findByPk(deviceId, {
    include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
  });
  if (!device) return;

  // Check manual override
  if (device.control_mode === 'MANUAL') {
    const overrideUntil = device.manual_override_until;
    if (!overrideUntil || new Date(overrideUntil) > new Date()) {
      console.log(
        '[LingkunganService] Manual override active. Skipping predictive control.'
      );
      return;
    }
  }

  const fanPredictedCritical =
    prediction.predicted_temperature >= PREDICT_TEMP_THRESHOLD;
  const dehumPredictedCritical =
    prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD ||
    prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD;

  // Hindari spam: hanya trigger jika aktuator yang dibutuhkan masih OFF.
  const triggerFan = fanPredictedCritical && device.fan_state !== 'ON';
  const triggerDehumidifier =
    dehumPredictedCritical && device.dehumidifier_state !== 'ON';

  const alerts: string[] = [];

  if (triggerFan) {
    alerts.push(
      `Suhu diprediksi mencapai ${prediction.predicted_temperature.toFixed(1)}°C (>= ${PREDICT_TEMP_THRESHOLD}°C)`
    );
  }

  if (
    triggerDehumidifier &&
    prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD
  ) {
    alerts.push(
      `Kelembapan diprediksi mencapai ${prediction.predicted_humidity.toFixed(1)}% (>= ${PREDICT_HUMIDITY_THRESHOLD}%)`
    );
  }

  if (
    triggerDehumidifier &&
    prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD
  ) {
    alerts.push(
      `CO2 diprediksi mencapai ${prediction.predicted_co2.toFixed(0)}ppm (>= ${PREDICT_CO2_THRESHOLD}ppm)`
    );
  }

  if (triggerFan || triggerDehumidifier) {
    const command: any = {};
    if (triggerFan) command.fan = 'ON';
    if (triggerDehumidifier) command.dehumidifier = 'ON';

    await sendActuatorCommand(deviceId, command, device);

    // Update device state
    const updateData: Partial<DeviceAttributes> = {};
    if (triggerFan) updateData.fan_state = 'ON';
    if (triggerDehumidifier) updateData.dehumidifier_state = 'ON';
    await device.update(updateData);

    // Update prediction record
    await PredictionResult.update(
      {
        fan_triggered: triggerFan,
        dehumidifier_triggered: triggerDehumidifier
      },
      {
        where: { device_id: deviceId },
        order: [['timestamp', 'DESC']],
        limit: 1
      } as any
    );

    // Send predictive alert
    await lingkunganAlertingService.processLingkunganAlert(
      deviceId,
      alerts,
      {
        temperature: prediction.predicted_temperature,
        humidity: prediction.predicted_humidity,
        co2: prediction.predicted_co2
      },
      'PREDICTIVE'
    );
  }
};

/**
 * Level 3: Failsafe warning — SEND ALERTS and TRIGGER ACTUATORS based on ACTUAL readings exceeding thresholds.
 */
const handleActualThresholdControl = async (
  data: {
    device_id: string;
    temperature: number;
    humidity: number;
    co2: number;
  },
  _device: Device
) => {
  // Re-read device to get fresh control_mode (avoid stale data race)
  const freshDevice = await Device.findByPk(data.device_id);
  if (!freshDevice) return;

  // Check manual override
  if (freshDevice.control_mode === 'MANUAL') {
    const overrideUntil = freshDevice.manual_override_until;
    if (!overrideUntil || new Date(overrideUntil) > new Date()) {
      console.log(
        '[LingkunganService] Manual override active. Skipping actual threshold control.'
      );
      return;
    }
  }

  let triggerFan = false;
  let triggerDehumidifier = false;
  const alerts: string[] = [];

  if (data.temperature >= FAILSAFE_TEMP_THRESHOLD) {
    triggerFan = true;
    alerts.push(
      `Suhu saat ini ${data.temperature.toFixed(1)}°C (>= ${FAILSAFE_TEMP_THRESHOLD}°C)`
    );
  }

  if (data.humidity >= FAILSAFE_HUMIDITY_THRESHOLD) {
    triggerDehumidifier = true;
    alerts.push(
      `Kelembapan saat ini ${data.humidity.toFixed(1)}% (>= ${FAILSAFE_HUMIDITY_THRESHOLD}%)`
    );
  }

  if (data.co2 >= FAILSAFE_CO2_THRESHOLD) {
    triggerDehumidifier = true;
    alerts.push(
      `CO2 saat ini ${data.co2.toFixed(0)}ppm (>= ${FAILSAFE_CO2_THRESHOLD}ppm)`
    );
  }

  if (triggerFan || triggerDehumidifier) {
    // Send actuator command as failsafe
    const command: any = {};
    if (triggerFan) command.fan = 'ON';
    if (triggerDehumidifier) command.dehumidifier = 'ON';

    await sendActuatorCommand(data.device_id, command, freshDevice);

    // Update device state
    const updateData: Partial<DeviceAttributes> = {};
    if (triggerFan) updateData.fan_state = 'ON';
    if (triggerDehumidifier) updateData.dehumidifier_state = 'ON';
    await freshDevice.update(updateData);

    // Add manual prompt
    alerts.push(
      "🚨 Silakan klik 'Aktifkan Mode Manual' di dashboard untuk mengambil alih kontrol."
    );

    // Send Telegram/Push notification based on actual data
    await lingkunganAlertingService.processLingkunganAlert(
      data.device_id,
      alerts,
      data,
      'FAILSAFE'
    );
  }
};

/**
 * Send actuator command to ESP32 via MQTT.
 */
export const sendActuatorCommand = async (
  deviceId: string,
  command: { fan?: string; dehumidifier?: string },
  device?: Device
) => {
  // Use provided device or fetch if not available
  const deviceWithArea =
    device && (device as any).area
      ? device
      : await Device.findByPk(deviceId, {
          include: [
            { model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }
          ]
        });

  if (!deviceWithArea) {
    throw new ApiError(404, 'Perangkat tidak ditemukan.');
  }

  const area = (deviceWithArea as any).area;
  const topic = `warehouses/${area.warehouse_id}/areas/${area.id}/devices/${deviceWithArea.id}/commands`;
  const payload = JSON.stringify(command);

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(
        `[LingkunganService] Failed to send command to ${topic}:`,
        err
      );
    } else {
      console.log(`[LingkunganService] Command '${payload}' sent to ${topic}`);
    }
  });
};

/**
 * Handle manual control from dashboard (Level 1 — highest priority).
 */
export const handleManualControl = async (
  deviceId: string,
  command: { fan?: string; dehumidifier?: string }
) => {
  // Set manual override mode with 5-minute expiry
  const overrideUntil = new Date(Date.now() + MANUAL_OVERRIDE_DURATION_MS);

  const updateData: any = {
    control_mode: 'MANUAL',
    manual_override_until: overrideUntil
  };
  if (command.fan) updateData.fan_state = command.fan;
  if (command.dehumidifier)
    updateData.dehumidifier_state = command.dehumidifier;

  await Device.update(updateData, { where: { id: deviceId } });

  // Send command to ESP32
  await sendActuatorCommand(deviceId, command);

  console.log(
    `[LingkunganService] Manual override set until ${overrideUntil.toISOString()}`
  );
};

/**
 * Switch back to auto mode.
 */
export const switchToAutoMode = async (deviceId: string) => {
  await Device.update(
    { control_mode: 'AUTO', manual_override_until: null },
    { where: { id: deviceId } }
  );
  console.log(
    `[LingkunganService] Switched to AUTO mode for device ${deviceId}`
  );
};

/**
 * Get lingkungan logs.
 */
export const getLingkunganLogs = async (options: {
  device_id: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) => {
  const { device_id, limit = 50, offset = 0, from, to } = options;
  const where: any = { device_id };

  if (from || to) {
    where.timestamp = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  const { count, rows } = await LingkunganLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['timestamp', 'DESC']]
  });

  return {
    data: rows,
    pagination: { total: count, limit, offset, hasMore: offset + limit < count }
  };
};

/**
 * Get summary statistics.
 */
export const getLingkunganSummary = async (
  device_id: string,
  from?: string,
  to?: string
) => {
  const where: any = { device_id };

  if (from || to) {
    where.timestamp = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  const total_readings = await LingkunganLog.count({ where });

  // Get latest readings
  const latest = await LingkunganLog.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  // Get latest prediction
  const latestPrediction = await PredictionResult.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  // Get alerts count (unacknowledged)
  const unacknowledged = await LingkunganLog.count({
    where: { ...where, status: 'unacknowledged' }
  });

  return {
    total_readings,
    unacknowledged,
    latest_reading: latest
      ? {
          temperature: latest.temperature,
          humidity: latest.humidity,
          co2: latest.co2,
          timestamp: latest.timestamp
        }
      : null,
    latest_prediction: latestPrediction
      ? {
          predicted_temperature: latestPrediction.predicted_temperature,
          predicted_humidity: latestPrediction.predicted_humidity,
          predicted_co2: latestPrediction.predicted_co2,
          timestamp: latestPrediction.timestamp
        }
      : null
  };
};

/**
 * Get chart data (actual vs predicted).
 */
export const getChartData = async (
  device_id: string,
  from?: string,
  to?: string,
  limit: number = 100
) => {
  const where: any = { device_id };

  if (from || to) {
    where.timestamp = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  console.log('[LingkunganService.getChartData]', {
    device_id,
    from,
    to,
    limit,
    whereClause: where
  });

  const actual = await LingkunganLog.findAll({
    where,
    attributes: ['timestamp', 'temperature', 'humidity', 'co2'],
    // Get newest first for efficient limiting, then reverse before returning.
    order: [['timestamp', 'DESC']],
    limit
  });

  const predictions = await PredictionResult.findAll({
    where,
    attributes: [
      'timestamp',
      'predicted_temperature',
      'predicted_humidity',
      'predicted_co2'
    ],
    // Get newest first for efficient limiting, then reverse before returning.
    order: [['timestamp', 'DESC']],
    limit
  });

  const result = {
    actual: actual.reverse(),
    predictions: predictions.reverse()
  };

  console.log('[LingkunganService.getChartData] Result:', {
    actualCount: result.actual.length,
    predictCount: result.predictions.length,
    firstActual: result.actual[0]?.timestamp,
    lastActual: result.actual[result.actual.length - 1]?.timestamp
  });

  return result;
};

/**
 * Get device status including control mode.
 */
export const getLingkunganStatus = async (device_id: string) => {
  const device = await Device.findByPk(device_id);
  if (!device) throw new ApiError(404, 'Perangkat tidak ditemukan.');

  const latest = await LingkunganLog.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  const latestPrediction = await PredictionResult.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  // Determine overall status
  let status: 'NORMAL' | 'WASPADA' | 'BAHAYA' = 'NORMAL';

  if (latest) {
    if (
      latest.temperature > PREDICT_TEMP_THRESHOLD ||
      latest.humidity > PREDICT_HUMIDITY_THRESHOLD ||
      latest.co2 > PREDICT_CO2_THRESHOLD
    ) {
      status = 'BAHAYA';
    } else if (
      latest.temperature > SAFE_TEMP ||
      latest.humidity > SAFE_HUMIDITY ||
      latest.co2 > SAFE_CO2
    ) {
      status = 'WASPADA';
    }
  }

  return {
    status,
    fan_state: device.fan_state || 'OFF',
    dehumidifier_state: device.dehumidifier_state || 'OFF',
    control_mode: device.control_mode || 'AUTO',
    manual_override_until: device.manual_override_until,
    latest_reading: latest
      ? {
          temperature: latest.temperature,
          humidity: latest.humidity,
          co2: latest.co2,
          timestamp: latest.timestamp
        }
      : null,
    latest_prediction: latestPrediction
      ? {
          predicted_temperature: latestPrediction.predicted_temperature,
          predicted_humidity: latestPrediction.predicted_humidity,
          predicted_co2: latestPrediction.predicted_co2,
          timestamp: latestPrediction.timestamp
        }
      : null
  };
};

/**
 * Update log acknowledgement status.
 */
export const updateLingkunganLogStatus = async (
  logId: string,
  userId: string,
  status: AcknowledgeStatus,
  notes?: string
) => {
  const log = await LingkunganLog.findByPk(logId);
  if (!log) throw new ApiError(404, 'Log lingkungan tidak ditemukan.');

  log.status = status;
  log.notes = notes || log.notes;
  log.acknowledged_by = userId;
  log.acknowledged_at = new Date();

  await log.save();
  return log;
};
