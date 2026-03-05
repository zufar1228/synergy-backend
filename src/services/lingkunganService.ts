// backend/src/services/lingkunganService.ts
import { Op } from 'sequelize';
import { LingkunganLog, PredictionResult, Device, Area } from '../db/models';
import { AcknowledgeStatus } from '../db/models/lingkunganLog';
import ApiError from '../utils/apiError';
import { client as mqttClient } from '../mqtt/client';
import * as alertingService from './alertingService';

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

  // 2. Update device with latest sensor readings
  await Device.update(
    {
      last_temperature: data.temperature,
      last_humidity: data.humidity,
      last_co2: data.co2
    } as any,
    { where: { id: data.device_id } }
  );

  // 3. Trigger ML prediction (non-blocking)
  triggerPrediction(data.device_id).catch((err) => {
    console.error('[LingkunganService] ML prediction failed:', err.message);
  });

  // 4. Check firmware safety thresholds (Level 2)
  await handleFirmwareSafetyCheck(data);

  return log;
};

/**
 * Trigger ML prediction by publishing a request to the ML server via MQTT.
 * The ML server subscribes to 'synergy/ml/predict/request', runs inference,
 * and publishes the result to 'synergy/ml/predict/response/{deviceId}'.
 * The response is handled asynchronously in handlePredictionResult().
 */
const triggerPrediction = async (deviceId: string) => {
  try {
    // Get the last 10 readings for the LSTM sequence
    const recentData = await LingkunganLog.findAll({
      where: { device_id: deviceId },
      order: [['timestamp', 'DESC']],
      limit: 10
    });

    if (recentData.length < 10) {
      console.log(
        `[LingkunganService] Not enough data for prediction (${recentData.length}/10). Skipping.`
      );
      return;
    }

    // Reverse so oldest is first
    const sequence = recentData.reverse().map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2: r.co2
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

    // Save prediction result
    const predResult = await PredictionResult.create({
      device_id: deviceId,
      predicted_temperature: prediction.predicted_temperature,
      predicted_humidity: prediction.predicted_humidity,
      predicted_co2: prediction.predicted_co2
    });

    console.log(
      `[LingkunganService] Prediction saved: T=${prediction.predicted_temperature}°C, H=${prediction.predicted_humidity}%, CO2=${prediction.predicted_co2}ppm`
    );

    // Check predictive thresholds (Level 3)
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
const handleFirmwareSafetyCheck = async (data: {
  device_id: string;
  temperature: number;
  humidity: number;
  co2: number;
}) => {
  // If ALL readings are below safe thresholds, turn off actuators
  if (
    data.temperature < SAFE_TEMP &&
    data.humidity < SAFE_HUMIDITY &&
    data.co2 < SAFE_CO2
  ) {
    const device = (await Device.findByPk(data.device_id)) as any;
    if (!device) return;

    // Check if in manual override mode
    if (device.control_mode === 'MANUAL' && device.manual_override_until) {
      const overrideExpiry = new Date(device.manual_override_until);
      if (overrideExpiry > new Date()) {
        console.log(
          '[LingkunganService] Manual override active. Skipping safety deactivation.'
        );
        return;
      }
      // Override expired, switch back to auto
      await Device.update(
        { control_mode: 'AUTO', manual_override_until: null } as any,
        { where: { id: data.device_id } }
      );
    }

    // Turn off actuators via MQTT
    if (
      (device as any).fan_state === 'ON' ||
      (device as any).dehumidifier_state === 'ON'
    ) {
      console.log(
        '[LingkunganService] Safety thresholds clear. Turning off actuators.'
      );
      await sendActuatorCommand(data.device_id, {
        fan: 'OFF',
        dehumidifier: 'OFF'
      });
      await Device.update(
        { fan_state: 'OFF', dehumidifier_state: 'OFF' } as any,
        { where: { id: data.device_id } }
      );
    }
  }
};

/**
 * Level 3: Predictive & Early Warning — activate actuators based on ML forecast.
 */
const handlePredictiveControl = async (
  deviceId: string,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
  }
) => {
  const device = (await Device.findByPk(deviceId)) as any;
  if (!device) return;

  // Check manual override
  if (device.control_mode === 'MANUAL' && device.manual_override_until) {
    const overrideExpiry = new Date(device.manual_override_until);
    if (overrideExpiry > new Date()) {
      console.log(
        '[LingkunganService] Manual override active. Skipping predictive control.'
      );
      return;
    }
  }

  let triggerFan = false;
  let triggerDehumidifier = false;
  const alerts: string[] = [];

  if (prediction.predicted_temperature > PREDICT_TEMP_THRESHOLD) {
    triggerFan = true;
    alerts.push(
      `Suhu diprediksi ${prediction.predicted_temperature.toFixed(1)}°C (> ${PREDICT_TEMP_THRESHOLD}°C)`
    );
  }

  if (prediction.predicted_humidity > PREDICT_HUMIDITY_THRESHOLD) {
    triggerDehumidifier = true;
    alerts.push(
      `Kelembapan diprediksi ${prediction.predicted_humidity.toFixed(1)}% (> ${PREDICT_HUMIDITY_THRESHOLD}%)`
    );
  }

  if (prediction.predicted_co2 > PREDICT_CO2_THRESHOLD) {
    triggerFan = true;
    alerts.push(
      `CO2 diprediksi ${prediction.predicted_co2.toFixed(0)}ppm (> ${PREDICT_CO2_THRESHOLD}ppm)`
    );
  }

  if (triggerFan || triggerDehumidifier) {
    const command: any = {};
    if (triggerFan) command.fan = 'ON';
    if (triggerDehumidifier) command.dehumidifier = 'ON';

    await sendActuatorCommand(deviceId, command);

    // Update device state
    const updateData: any = {};
    if (triggerFan) updateData.fan_state = 'ON';
    if (triggerDehumidifier) updateData.dehumidifier_state = 'ON';
    await Device.update(updateData, { where: { id: deviceId } });

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

    // Send Telegram notification
    await alertingService.processLingkunganAlert(deviceId, alerts, prediction);
  }
};

/**
 * Send actuator command to ESP32 via MQTT.
 */
export const sendActuatorCommand = async (
  deviceId: string,
  command: { fan?: string; dehumidifier?: string }
) => {
  const device = (await Device.findByPk(deviceId, {
    include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
  })) as any;

  if (!device) {
    throw new ApiError(404, 'Perangkat tidak ditemukan.');
  }

  const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
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
    { control_mode: 'AUTO', manual_override_until: null } as any,
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

  const actual = await LingkunganLog.findAll({
    where,
    attributes: ['timestamp', 'temperature', 'humidity', 'co2'],
    order: [['timestamp', 'ASC']],
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
    order: [['timestamp', 'ASC']],
    limit
  });

  return { actual, predictions };
};

/**
 * Get device status including control mode.
 */
export const getLingkunganStatus = async (device_id: string) => {
  const device = (await Device.findByPk(device_id)) as any;
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
