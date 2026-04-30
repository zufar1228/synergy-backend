/**
 * @file lingkunganService.ts
 * @purpose Core data operations for lingkungan — ingest sensor data, predictions, actuator control, queries
 * @usedBy lingkunganController, mqtt/client
 * @deps db/drizzle, schema (devices, areas, lingkungan_logs, prediction_results), mqtt/client
 * @exports ingestSensorData, handlePredictionResult, sendActuatorCommand, handleManualControl, switchToAutoMode, getLingkunganLogs, getLingkunganSummary, getChartData, getLingkunganStatus, updateLingkunganLogStatus
 * @sideEffects DB read/write, MQTT publish
 */

import { db } from '../../../db/drizzle';
import {
  devices,
  areas,
  lingkungan_logs,
  prediction_results,
  type AcknowledgeStatus
} from '../../../db/schema';
import { eq, and, gte, lte, count, desc } from 'drizzle-orm';
import ApiError from '../../../utils/apiError';
import { client as mqttClient } from '../../../mqtt/client';
import * as lingkunganAlertingService from './lingkunganAlertingService';

import { env } from '../../../config/env';

// ML server HTTP endpoint (no longer goes through EMQX)
const ML_SERVER_URL = env.ML_SERVER_URL;

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

// Per-device prediction mutex to prevent parallel predictions
const predictionInFlight = new Set<string>();

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
  const [log] = await db
    .insert(lingkungan_logs)
    .values({
      device_id: data.device_id,
      temperature: data.temperature,
      humidity: data.humidity,
      co2: data.co2
    })
    .returning();

  console.log(
    `[LingkunganService] Ingested sensor data: T=${data.temperature}°C, H=${data.humidity}%, CO2=${data.co2}ppm for device ${data.device_id}`
  );

  // 2. Fetch device once, share across all downstream calls
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, data.device_id),
    with: { area: { columns: { id: true, warehouse_id: true } } }
  });

  if (!device) {
    console.error(`[LingkunganService] Device ${data.device_id} not found`);
    return log;
  }

  // 3. Update device with latest sensor readings
  await db
    .update(devices)
    .set({
      last_temperature: data.temperature,
      last_humidity: data.humidity,
      last_co2: data.co2
    })
    .where(eq(devices.id, data.device_id));

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
 * Trigger ML prediction via direct HTTP call to the ML server.
 */
const triggerPrediction = async (deviceId: string, device: any) => {
  // Skip if a prediction is already in flight for this device
  if (predictionInFlight.has(deviceId)) {
    console.log(
      `[LingkunganService] Prediction already in flight for ${deviceId}. Skipping.`
    );
    return;
  }
  predictionInFlight.add(deviceId);

  try {
    const [countResult] = await db
      .select({ count: count() })
      .from(lingkungan_logs)
      .where(eq(lingkungan_logs.device_id, deviceId));
    const totalLogs = Number(countResult.count);

    if (totalLogs < ML_SEQUENCE_LENGTH) {
      console.log(
        `[LingkunganService] Not enough data for prediction (${totalLogs}/${ML_SEQUENCE_LENGTH}). Skipping.`
      );
      return;
    }

    const recentData = await db.query.lingkungan_logs.findMany({
      where: eq(lingkungan_logs.device_id, deviceId),
      orderBy: [desc(lingkungan_logs.timestamp), desc(lingkungan_logs.id)],
      limit: ML_SEQUENCE_LENGTH
    });

    const sequence = recentData.reverse().map((r) => ({
      temperature: r.temperature,
      humidity: r.humidity,
      co2: r.co2,
      timestamp: r.timestamp!.toISOString(),
      status_kipas: device.fan_state === 'ON' ? 1 : 0,
      status_dehumidifier: device.dehumidifier_state === 'ON' ? 1 : 0
    }));

    const response = await fetch(`${ML_SERVER_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, sequence }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.error(
        `[LingkunganService] ML server returned HTTP ${response.status} for ${deviceId}`
      );
      return;
    }

    const prediction = await response.json();
    console.log(
      `[LingkunganService] ML prediction received for device ${deviceId}`
    );

    await handlePredictionResult(deviceId, prediction);
  } catch (error: any) {
    console.error(
      '[LingkunganService] ML prediction request error:',
      error.message
    );
  } finally {
    predictionInFlight.delete(deviceId);
  }
};

/**
 * Handle the ML prediction result from the HTTP response.
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
    if (prediction.error) {
      console.error(
        `[LingkunganService] ML server returned error for ${deviceId}: ${prediction.error}`
      );
      return;
    }

    const latestLog = await db.query.lingkungan_logs.findFirst({
      where: eq(lingkungan_logs.device_id, deviceId),
      orderBy: [desc(lingkungan_logs.timestamp)]
    });
    const forecastedAt = latestLog?.timestamp
      ? new Date(latestLog.timestamp.getTime() + 15 * 60 * 1000)
      : new Date(Date.now() + 15 * 60 * 1000);

    const [predResult] = await db
      .insert(prediction_results)
      .values({
        device_id: deviceId,
        predicted_temperature: prediction.predicted_temperature,
        predicted_humidity: prediction.predicted_humidity,
        predicted_co2: prediction.predicted_co2,
        timestamp: forecastedAt
      })
      .returning();

    console.log(
      `[LingkunganService] Prediction saved: T=${prediction.predicted_temperature}°C, H=${prediction.predicted_humidity}%, CO2=${prediction.predicted_co2}ppm`
    );

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
  _device: any
) => {
  if (
    data.temperature < SAFE_TEMP &&
    data.humidity < SAFE_HUMIDITY &&
    data.co2 < SAFE_CO2
  ) {
    const freshDevice = await db.query.devices.findFirst({
      where: eq(devices.id, data.device_id),
      with: { area: { columns: { id: true, warehouse_id: true } } }
    });
    if (!freshDevice) return;

    if (freshDevice.control_mode === 'MANUAL') {
      const overrideUntil = freshDevice.manual_override_until;
      if (!overrideUntil || new Date(overrideUntil) > new Date()) {
        console.log(
          '[LingkunganService] Manual override active. Skipping safety deactivation.'
        );
        return;
      }
      await db
        .update(devices)
        .set({ control_mode: 'AUTO', manual_override_until: null })
        .where(eq(devices.id, data.device_id));
    }

    if (
      freshDevice.fan_state === 'ON' ||
      freshDevice.dehumidifier_state === 'ON'
    ) {
      console.log(
        '[LingkunganService] Safety thresholds clear. Turning off actuators.'
      );
      await sendActuatorCommand(
        data.device_id,
        { fan: 'OFF', dehumidifier: 'OFF' },
        freshDevice
      );
      await db
        .update(devices)
        .set({ fan_state: 'OFF', dehumidifier_state: 'OFF' })
        .where(eq(devices.id, data.device_id));

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
 */
const handlePredictiveControl = async (
  deviceId: string,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
  }
) => {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, deviceId),
    with: { area: { columns: { id: true, warehouse_id: true } } }
  });
  if (!device) return;

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

    const updateData: Record<string, any> = {};
    if (triggerFan) updateData.fan_state = 'ON';
    if (triggerDehumidifier) updateData.dehumidifier_state = 'ON';
    await db.update(devices).set(updateData).where(eq(devices.id, deviceId));

    const latestPrediction = await db.query.prediction_results.findFirst({
      where: eq(prediction_results.device_id, deviceId),
      orderBy: [desc(prediction_results.timestamp)]
    });
    if (latestPrediction) {
      await db
        .update(prediction_results)
        .set({
          fan_triggered: triggerFan,
          dehumidifier_triggered: triggerDehumidifier
        })
        .where(eq(prediction_results.id, latestPrediction.id));
    }

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
 * Level 3: Failsafe warning — SEND ALERTS and TRIGGER ACTUATORS based on ACTUAL readings.
 */
const handleActualThresholdControl = async (
  data: {
    device_id: string;
    temperature: number;
    humidity: number;
    co2: number;
  },
  _device: any
) => {
  const freshDevice = await db.query.devices.findFirst({
    where: eq(devices.id, data.device_id)
  });
  if (!freshDevice) return;

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
    const command: any = {};
    if (triggerFan) command.fan = 'ON';
    if (triggerDehumidifier) command.dehumidifier = 'ON';

    await sendActuatorCommand(data.device_id, command, freshDevice);

    const updateData: Record<string, any> = {};
    if (triggerFan) updateData.fan_state = 'ON';
    if (triggerDehumidifier) updateData.dehumidifier_state = 'ON';
    await db
      .update(devices)
      .set(updateData)
      .where(eq(devices.id, data.device_id));

    alerts.push(
      "Silakan klik 'Aktifkan Mode Manual' di dashboard untuk mengambil alih kontrol."
    );

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
  device?: any
) => {
  const deviceWithArea =
    device && device.area
      ? device
      : await db.query.devices.findFirst({
          where: eq(devices.id, deviceId),
          with: { area: { columns: { id: true, warehouse_id: true } } }
        });

  if (!deviceWithArea) {
    throw new ApiError(404, 'Perangkat tidak ditemukan.');
  }

  const area = deviceWithArea.area;
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
  const overrideUntil = new Date(Date.now() + MANUAL_OVERRIDE_DURATION_MS);

  const updateData: Record<string, any> = {
    control_mode: 'MANUAL',
    manual_override_until: overrideUntil
  };
  if (command.fan) updateData.fan_state = command.fan;
  if (command.dehumidifier)
    updateData.dehumidifier_state = command.dehumidifier;

  await db.update(devices).set(updateData).where(eq(devices.id, deviceId));
  await sendActuatorCommand(deviceId, command);

  console.log(
    `[LingkunganService] Manual override set until ${overrideUntil.toISOString()}`
  );
};

/**
 * Switch back to auto mode.
 */
export const switchToAutoMode = async (deviceId: string) => {
  await db
    .update(devices)
    .set({ control_mode: 'AUTO', manual_override_until: null })
    .where(eq(devices.id, deviceId));
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
  const conditions = [eq(lingkungan_logs.device_id, device_id)];

  if (from) conditions.push(gte(lingkungan_logs.timestamp, new Date(from)));
  if (to) conditions.push(lte(lingkungan_logs.timestamp, new Date(to)));

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: count() })
    .from(lingkungan_logs)
    .where(whereClause);
  const total = Number(countResult.count);

  const data = await db.query.lingkungan_logs.findMany({
    where: whereClause,
    limit,
    offset,
    orderBy: [desc(lingkungan_logs.timestamp)]
  });

  return {
    data,
    pagination: { total, limit, offset, hasMore: offset + limit < total }
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
  const conditions = [eq(lingkungan_logs.device_id, device_id)];
  if (from) conditions.push(gte(lingkungan_logs.timestamp, new Date(from)));
  if (to) conditions.push(lte(lingkungan_logs.timestamp, new Date(to)));

  const baseWhere = and(...conditions);

  const [totalResult] = await db
    .select({ count: count() })
    .from(lingkungan_logs)
    .where(baseWhere);

  const latest = await db.query.lingkungan_logs.findFirst({
    where: eq(lingkungan_logs.device_id, device_id),
    orderBy: [desc(lingkungan_logs.timestamp)]
  });

  const latestPrediction = await db.query.prediction_results.findFirst({
    where: eq(prediction_results.device_id, device_id),
    orderBy: [desc(prediction_results.timestamp)]
  });

  const [unackResult] = await db
    .select({ count: count() })
    .from(lingkungan_logs)
    .where(and(...conditions, eq(lingkungan_logs.status, 'unacknowledged')));

  return {
    total_readings: Number(totalResult.count),
    unacknowledged: Number(unackResult.count),
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
  const conditions = [eq(lingkungan_logs.device_id, device_id)];
  if (from) conditions.push(gte(lingkungan_logs.timestamp, new Date(from)));
  if (to) conditions.push(lte(lingkungan_logs.timestamp, new Date(to)));

  const whereClause = and(...conditions);

  const predConditions = [eq(prediction_results.device_id, device_id)];
  if (from)
    predConditions.push(gte(prediction_results.timestamp, new Date(from)));
  if (to) predConditions.push(lte(prediction_results.timestamp, new Date(to)));
  const predWhere = and(...predConditions);

  console.log('[LingkunganService.getChartData]', {
    device_id,
    from,
    to,
    limit
  });

  const actual = await db.query.lingkungan_logs.findMany({
    where: whereClause,
    columns: { timestamp: true, temperature: true, humidity: true, co2: true },
    orderBy: [desc(lingkungan_logs.timestamp)],
    limit
  });

  const predictions = await db.query.prediction_results.findMany({
    where: predWhere,
    columns: {
      timestamp: true,
      predicted_temperature: true,
      predicted_humidity: true,
      predicted_co2: true
    },
    orderBy: [desc(prediction_results.timestamp)],
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
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, device_id)
  });
  if (!device) throw new ApiError(404, 'Perangkat tidak ditemukan.');

  const latest = await db.query.lingkungan_logs.findFirst({
    where: eq(lingkungan_logs.device_id, device_id),
    orderBy: [desc(lingkungan_logs.timestamp)]
  });

  const latestPrediction = await db.query.prediction_results.findFirst({
    where: eq(prediction_results.device_id, device_id),
    orderBy: [desc(prediction_results.timestamp)]
  });

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
  const existing = await db.query.lingkungan_logs.findFirst({
    where: eq(lingkungan_logs.id, logId)
  });
  if (!existing) throw new ApiError(404, 'Log lingkungan tidak ditemukan.');

  const [updated] = await db
    .update(lingkungan_logs)
    .set({
      status,
      notes: notes || existing.notes,
      acknowledged_by: userId,
      acknowledged_at: new Date()
    })
    .where(eq(lingkungan_logs.id, logId))
    .returning();

  return updated;
};
