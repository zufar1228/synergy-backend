"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateLingkunganLogStatus = exports.getLingkunganStatus = exports.getChartData = exports.getLingkunganSummary = exports.getLingkunganLogs = exports.switchToAutoMode = exports.handleManualControl = exports.sendActuatorCommand = exports.handlePredictionResult = exports.ingestSensorData = void 0;
// backend/src/services/lingkunganService.ts
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../../../utils/apiError"));
const client_1 = require("../../../mqtt/client");
const lingkunganAlertingService = __importStar(require("./lingkunganAlertingService"));
const env_1 = require("../../../config/env");
// ML server HTTP endpoint (no longer goes through EMQX)
const ML_SERVER_URL = env_1.env.ML_SERVER_URL;
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
const predictionInFlight = new Set();
/**
 * Ingest raw sensor data from MQTT and trigger ML prediction pipeline.
 */
const ingestSensorData = async (data) => {
    // 1. Save raw sensor data
    const [log] = await drizzle_1.db
        .insert(schema_1.lingkungan_logs)
        .values({
        device_id: data.device_id,
        temperature: data.temperature,
        humidity: data.humidity,
        co2: data.co2
    })
        .returning();
    console.log(`[LingkunganService] Ingested sensor data: T=${data.temperature}°C, H=${data.humidity}%, CO2=${data.co2}ppm for device ${data.device_id}`);
    // 2. Fetch device once, share across all downstream calls
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id),
        with: { area: { columns: { id: true, warehouse_id: true } } }
    });
    if (!device) {
        console.error(`[LingkunganService] Device ${data.device_id} not found`);
        return log;
    }
    // 3. Update device with latest sensor readings
    await drizzle_1.db
        .update(schema_1.devices)
        .set({
        last_temperature: data.temperature,
        last_humidity: data.humidity,
        last_co2: data.co2
    })
        .where((0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id));
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
exports.ingestSensorData = ingestSensorData;
/**
 * Trigger ML prediction via direct HTTP call to the ML server.
 */
const triggerPrediction = async (deviceId, device) => {
    // Skip if a prediction is already in flight for this device
    if (predictionInFlight.has(deviceId)) {
        console.log(`[LingkunganService] Prediction already in flight for ${deviceId}. Skipping.`);
        return;
    }
    predictionInFlight.add(deviceId);
    try {
        const [countResult] = await drizzle_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.lingkungan_logs)
            .where((0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, deviceId));
        const totalLogs = Number(countResult.count);
        if (totalLogs < ML_SEQUENCE_LENGTH) {
            console.log(`[LingkunganService] Not enough data for prediction (${totalLogs}/${ML_SEQUENCE_LENGTH}). Skipping.`);
            return;
        }
        const recentData = await drizzle_1.db.query.lingkungan_logs.findMany({
            where: (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, deviceId),
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp), (0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.id)],
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
        const response = await fetch(`${ML_SERVER_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: deviceId, sequence }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
            console.error(`[LingkunganService] ML server returned HTTP ${response.status} for ${deviceId}`);
            return;
        }
        const prediction = await response.json();
        console.log(`[LingkunganService] ML prediction received for device ${deviceId}`);
        await (0, exports.handlePredictionResult)(deviceId, prediction);
    }
    catch (error) {
        console.error('[LingkunganService] ML prediction request error:', error.message);
    }
    finally {
        predictionInFlight.delete(deviceId);
    }
};
/**
 * Handle the ML prediction result from the HTTP response.
 */
const handlePredictionResult = async (deviceId, prediction) => {
    try {
        if (prediction.error) {
            console.error(`[LingkunganService] ML server returned error for ${deviceId}: ${prediction.error}`);
            return;
        }
        const latestLog = await drizzle_1.db.query.lingkungan_logs.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, deviceId),
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp)]
        });
        const forecastedAt = latestLog?.timestamp
            ? new Date(latestLog.timestamp.getTime() + 15 * 60 * 1000)
            : new Date(Date.now() + 15 * 60 * 1000);
        const [predResult] = await drizzle_1.db
            .insert(schema_1.prediction_results)
            .values({
            device_id: deviceId,
            predicted_temperature: prediction.predicted_temperature,
            predicted_humidity: prediction.predicted_humidity,
            predicted_co2: prediction.predicted_co2,
            timestamp: forecastedAt
        })
            .returning();
        console.log(`[LingkunganService] Prediction saved: T=${prediction.predicted_temperature}°C, H=${prediction.predicted_humidity}%, CO2=${prediction.predicted_co2}ppm`);
        await handlePredictiveControl(deviceId, prediction);
        return predResult;
    }
    catch (error) {
        console.error('[LingkunganService] Error handling prediction result:', error.message);
    }
};
exports.handlePredictionResult = handlePredictionResult;
/**
 * Level 2: Firmware safety check — turn OFF actuators if below safe thresholds.
 */
const handleFirmwareSafetyCheck = async (data, _device) => {
    if (data.temperature < SAFE_TEMP &&
        data.humidity < SAFE_HUMIDITY &&
        data.co2 < SAFE_CO2) {
        const freshDevice = await drizzle_1.db.query.devices.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id),
            with: { area: { columns: { id: true, warehouse_id: true } } }
        });
        if (!freshDevice)
            return;
        if (freshDevice.control_mode === 'MANUAL') {
            const overrideUntil = freshDevice.manual_override_until;
            if (!overrideUntil || new Date(overrideUntil) > new Date()) {
                console.log('[LingkunganService] Manual override active. Skipping safety deactivation.');
                return;
            }
            await drizzle_1.db
                .update(schema_1.devices)
                .set({ control_mode: 'AUTO', manual_override_until: null })
                .where((0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id));
        }
        if (freshDevice.fan_state === 'ON' ||
            freshDevice.dehumidifier_state === 'ON') {
            console.log('[LingkunganService] Safety thresholds clear. Turning off actuators.');
            await (0, exports.sendActuatorCommand)(data.device_id, { fan: 'OFF', dehumidifier: 'OFF' }, freshDevice);
            await drizzle_1.db
                .update(schema_1.devices)
                .set({ fan_state: 'OFF', dehumidifier_state: 'OFF' })
                .where((0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id));
            await lingkunganAlertingService.processLingkunganAlert(data.device_id, ['Kondisi lingkungan kembali stabil. Aktuator dinonaktifkan.'], data, 'RECOVERY');
        }
    }
};
/**
 * Level 3: Predictive & Early Warning — activate actuators based on ML forecast.
 */
const handlePredictiveControl = async (deviceId, prediction) => {
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId),
        with: { area: { columns: { id: true, warehouse_id: true } } }
    });
    if (!device)
        return;
    if (device.control_mode === 'MANUAL') {
        const overrideUntil = device.manual_override_until;
        if (!overrideUntil || new Date(overrideUntil) > new Date()) {
            console.log('[LingkunganService] Manual override active. Skipping predictive control.');
            return;
        }
    }
    const fanPredictedCritical = prediction.predicted_temperature >= PREDICT_TEMP_THRESHOLD;
    const dehumPredictedCritical = prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD ||
        prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD;
    const triggerFan = fanPredictedCritical && device.fan_state !== 'ON';
    const triggerDehumidifier = dehumPredictedCritical && device.dehumidifier_state !== 'ON';
    const alerts = [];
    if (triggerFan) {
        alerts.push(`Suhu diprediksi mencapai ${prediction.predicted_temperature.toFixed(1)}°C (>= ${PREDICT_TEMP_THRESHOLD}°C)`);
    }
    if (triggerDehumidifier &&
        prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD) {
        alerts.push(`Kelembapan diprediksi mencapai ${prediction.predicted_humidity.toFixed(1)}% (>= ${PREDICT_HUMIDITY_THRESHOLD}%)`);
    }
    if (triggerDehumidifier &&
        prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD) {
        alerts.push(`CO2 diprediksi mencapai ${prediction.predicted_co2.toFixed(0)}ppm (>= ${PREDICT_CO2_THRESHOLD}ppm)`);
    }
    if (triggerFan || triggerDehumidifier) {
        const command = {};
        if (triggerFan)
            command.fan = 'ON';
        if (triggerDehumidifier)
            command.dehumidifier = 'ON';
        await (0, exports.sendActuatorCommand)(deviceId, command, device);
        const updateData = {};
        if (triggerFan)
            updateData.fan_state = 'ON';
        if (triggerDehumidifier)
            updateData.dehumidifier_state = 'ON';
        await drizzle_1.db.update(schema_1.devices).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId));
        const latestPrediction = await drizzle_1.db.query.prediction_results.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.prediction_results.device_id, deviceId),
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.prediction_results.timestamp)]
        });
        if (latestPrediction) {
            await drizzle_1.db
                .update(schema_1.prediction_results)
                .set({
                fan_triggered: triggerFan,
                dehumidifier_triggered: triggerDehumidifier
            })
                .where((0, drizzle_orm_1.eq)(schema_1.prediction_results.id, latestPrediction.id));
        }
        await lingkunganAlertingService.processLingkunganAlert(deviceId, alerts, {
            temperature: prediction.predicted_temperature,
            humidity: prediction.predicted_humidity,
            co2: prediction.predicted_co2
        }, 'PREDICTIVE');
    }
};
/**
 * Level 3: Failsafe warning — SEND ALERTS and TRIGGER ACTUATORS based on ACTUAL readings.
 */
const handleActualThresholdControl = async (data, _device) => {
    const freshDevice = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id)
    });
    if (!freshDevice)
        return;
    if (freshDevice.control_mode === 'MANUAL') {
        const overrideUntil = freshDevice.manual_override_until;
        if (!overrideUntil || new Date(overrideUntil) > new Date()) {
            console.log('[LingkunganService] Manual override active. Skipping actual threshold control.');
            return;
        }
    }
    let triggerFan = false;
    let triggerDehumidifier = false;
    const alerts = [];
    if (data.temperature >= FAILSAFE_TEMP_THRESHOLD) {
        triggerFan = true;
        alerts.push(`Suhu saat ini ${data.temperature.toFixed(1)}°C (>= ${FAILSAFE_TEMP_THRESHOLD}°C)`);
    }
    if (data.humidity >= FAILSAFE_HUMIDITY_THRESHOLD) {
        triggerDehumidifier = true;
        alerts.push(`Kelembapan saat ini ${data.humidity.toFixed(1)}% (>= ${FAILSAFE_HUMIDITY_THRESHOLD}%)`);
    }
    if (data.co2 >= FAILSAFE_CO2_THRESHOLD) {
        triggerDehumidifier = true;
        alerts.push(`CO2 saat ini ${data.co2.toFixed(0)}ppm (>= ${FAILSAFE_CO2_THRESHOLD}ppm)`);
    }
    if (triggerFan || triggerDehumidifier) {
        const command = {};
        if (triggerFan)
            command.fan = 'ON';
        if (triggerDehumidifier)
            command.dehumidifier = 'ON';
        await (0, exports.sendActuatorCommand)(data.device_id, command, freshDevice);
        const updateData = {};
        if (triggerFan)
            updateData.fan_state = 'ON';
        if (triggerDehumidifier)
            updateData.dehumidifier_state = 'ON';
        await drizzle_1.db
            .update(schema_1.devices)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema_1.devices.id, data.device_id));
        alerts.push("🚨 Silakan klik 'Aktifkan Mode Manual' di dashboard untuk mengambil alih kontrol.");
        await lingkunganAlertingService.processLingkunganAlert(data.device_id, alerts, data, 'FAILSAFE');
    }
};
/**
 * Send actuator command to ESP32 via MQTT.
 */
const sendActuatorCommand = async (deviceId, command, device) => {
    const deviceWithArea = device && device.area
        ? device
        : await drizzle_1.db.query.devices.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId),
            with: { area: { columns: { id: true, warehouse_id: true } } }
        });
    if (!deviceWithArea) {
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan.');
    }
    const area = deviceWithArea.area;
    const topic = `warehouses/${area.warehouse_id}/areas/${area.id}/devices/${deviceWithArea.id}/commands`;
    const payload = JSON.stringify(command);
    client_1.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error(`[LingkunganService] Failed to send command to ${topic}:`, err);
        }
        else {
            console.log(`[LingkunganService] Command '${payload}' sent to ${topic}`);
        }
    });
};
exports.sendActuatorCommand = sendActuatorCommand;
/**
 * Handle manual control from dashboard (Level 1 — highest priority).
 */
const handleManualControl = async (deviceId, command) => {
    const overrideUntil = new Date(Date.now() + MANUAL_OVERRIDE_DURATION_MS);
    const updateData = {
        control_mode: 'MANUAL',
        manual_override_until: overrideUntil
    };
    if (command.fan)
        updateData.fan_state = command.fan;
    if (command.dehumidifier)
        updateData.dehumidifier_state = command.dehumidifier;
    await drizzle_1.db.update(schema_1.devices).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId));
    await (0, exports.sendActuatorCommand)(deviceId, command);
    console.log(`[LingkunganService] Manual override set until ${overrideUntil.toISOString()}`);
};
exports.handleManualControl = handleManualControl;
/**
 * Switch back to auto mode.
 */
const switchToAutoMode = async (deviceId) => {
    await drizzle_1.db
        .update(schema_1.devices)
        .set({ control_mode: 'AUTO', manual_override_until: null })
        .where((0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId));
    console.log(`[LingkunganService] Switched to AUTO mode for device ${deviceId}`);
};
exports.switchToAutoMode = switchToAutoMode;
/**
 * Get lingkungan logs.
 */
const getLingkunganLogs = async (options) => {
    const { device_id, limit = 50, offset = 0, from, to } = options;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, device_id)];
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.lingkungan_logs.timestamp, new Date(from)));
    if (to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.lingkungan_logs.timestamp, new Date(to)));
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
    const [countResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.lingkungan_logs)
        .where(whereClause);
    const total = Number(countResult.count);
    const data = await drizzle_1.db.query.lingkungan_logs.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp)]
    });
    return {
        data,
        pagination: { total, limit, offset, hasMore: offset + limit < total }
    };
};
exports.getLingkunganLogs = getLingkunganLogs;
/**
 * Get summary statistics.
 */
const getLingkunganSummary = async (device_id, from, to) => {
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, device_id)];
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.lingkungan_logs.timestamp, new Date(from)));
    if (to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.lingkungan_logs.timestamp, new Date(to)));
    const baseWhere = (0, drizzle_orm_1.and)(...conditions);
    const [totalResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.lingkungan_logs)
        .where(baseWhere);
    const latest = await drizzle_1.db.query.lingkungan_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp)]
    });
    const latestPrediction = await drizzle_1.db.query.prediction_results.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.prediction_results.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.prediction_results.timestamp)]
    });
    const [unackResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.lingkungan_logs)
        .where((0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.status, 'unacknowledged')));
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
exports.getLingkunganSummary = getLingkunganSummary;
/**
 * Get chart data (actual vs predicted).
 */
const getChartData = async (device_id, from, to, limit = 100) => {
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, device_id)];
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.lingkungan_logs.timestamp, new Date(from)));
    if (to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.lingkungan_logs.timestamp, new Date(to)));
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
    const predConditions = [(0, drizzle_orm_1.eq)(schema_1.prediction_results.device_id, device_id)];
    if (from)
        predConditions.push((0, drizzle_orm_1.gte)(schema_1.prediction_results.timestamp, new Date(from)));
    if (to)
        predConditions.push((0, drizzle_orm_1.lte)(schema_1.prediction_results.timestamp, new Date(to)));
    const predWhere = (0, drizzle_orm_1.and)(...predConditions);
    console.log('[LingkunganService.getChartData]', {
        device_id,
        from,
        to,
        limit
    });
    const actual = await drizzle_1.db.query.lingkungan_logs.findMany({
        where: whereClause,
        columns: { timestamp: true, temperature: true, humidity: true, co2: true },
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp)],
        limit
    });
    const predictions = await drizzle_1.db.query.prediction_results.findMany({
        where: predWhere,
        columns: {
            timestamp: true,
            predicted_temperature: true,
            predicted_humidity: true,
            predicted_co2: true
        },
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.prediction_results.timestamp)],
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
exports.getChartData = getChartData;
/**
 * Get device status including control mode.
 */
const getLingkunganStatus = async (device_id) => {
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, device_id)
    });
    if (!device)
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan.');
    const latest = await drizzle_1.db.query.lingkungan_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.lingkungan_logs.timestamp)]
    });
    const latestPrediction = await drizzle_1.db.query.prediction_results.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.prediction_results.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.prediction_results.timestamp)]
    });
    let status = 'NORMAL';
    if (latest) {
        if (latest.temperature > PREDICT_TEMP_THRESHOLD ||
            latest.humidity > PREDICT_HUMIDITY_THRESHOLD ||
            latest.co2 > PREDICT_CO2_THRESHOLD) {
            status = 'BAHAYA';
        }
        else if (latest.temperature > SAFE_TEMP ||
            latest.humidity > SAFE_HUMIDITY ||
            latest.co2 > SAFE_CO2) {
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
exports.getLingkunganStatus = getLingkunganStatus;
/**
 * Update log acknowledgement status.
 */
const updateLingkunganLogStatus = async (logId, userId, status, notes) => {
    const existing = await drizzle_1.db.query.lingkungan_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.id, logId)
    });
    if (!existing)
        throw new apiError_1.default(404, 'Log lingkungan tidak ditemukan.');
    const [updated] = await drizzle_1.db
        .update(schema_1.lingkungan_logs)
        .set({
        status,
        notes: notes || existing.notes,
        acknowledged_by: userId,
        acknowledged_at: new Date()
    })
        .where((0, drizzle_orm_1.eq)(schema_1.lingkungan_logs.id, logId))
        .returning();
    return updated;
};
exports.updateLingkunganLogStatus = updateLingkunganLogStatus;
