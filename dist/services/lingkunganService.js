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
const sequelize_1 = require("sequelize");
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const client_1 = require("../mqtt/client");
const alertingService = __importStar(require("./alertingService"));
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
// ML v3 expects 240 samples (15s interval x 1 hour)
const ML_SEQUENCE_LENGTH = 240;
// Manual override duration (5 minutes)
const MANUAL_OVERRIDE_DURATION_MS = 5 * 60 * 1000;
/**
 * Ingest raw sensor data from MQTT and trigger ML prediction pipeline.
 */
const ingestSensorData = async (data) => {
    // 1. Save raw sensor data
    const log = await models_1.LingkunganLog.create({
        device_id: data.device_id,
        temperature: data.temperature,
        humidity: data.humidity,
        co2: data.co2
    });
    console.log(`[LingkunganService] Ingested sensor data: T=${data.temperature}°C, H=${data.humidity}%, CO2=${data.co2}ppm for device ${data.device_id}`);
    // 2. Fetch device once, share across all downstream calls
    const device = await models_1.Device.findByPk(data.device_id, {
        include: [{ model: models_1.Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
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
exports.ingestSensorData = ingestSensorData;
/**
 * Trigger ML prediction by publishing a request to the ML server via MQTT.
 * The ML server subscribes to 'synergy/ml/predict/request', runs inference,
 * and publishes the result to 'synergy/ml/predict/response/{deviceId}'.
 * The response is handled asynchronously in handlePredictionResult().
 */
const triggerPrediction = async (deviceId, device) => {
    try {
        const totalLogs = await models_1.LingkunganLog.count({
            where: { device_id: deviceId }
        });
        // Only trigger prediction when we have at least 1 full hour of data.
        if (totalLogs < ML_SEQUENCE_LENGTH) {
            console.log(`[LingkunganService] Not enough data for prediction (${totalLogs}/${ML_SEQUENCE_LENGTH}). Skipping.`);
            return;
        }
        // Trigger only on each complete 240-reading boundary.
        if (totalLogs % ML_SEQUENCE_LENGTH !== 0) {
            return;
        }
        // Get the latest ML_SEQUENCE_LENGTH readings then reverse to oldest-first.
        const recentData = await models_1.LingkunganLog.findAll({
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
        client_1.client.publish(ML_PREDICT_REQUEST_TOPIC, payload, { qos: 1 }, (err) => {
            if (err) {
                console.error(`[LingkunganService] Failed to publish ML prediction request for ${deviceId}:`, err);
            }
            else {
                console.log(`[LingkunganService] ML prediction request published for device ${deviceId}`);
            }
        });
    }
    catch (error) {
        console.error('[LingkunganService] ML prediction request error:', error.message);
    }
};
/**
 * Handle the ML prediction result received via MQTT.
 * Called from the MQTT client when a message arrives on
 * 'synergy/ml/predict/response/{deviceId}'.
 */
const handlePredictionResult = async (deviceId, prediction) => {
    try {
        // Check for ML server error
        if (prediction.error) {
            console.error(`[LingkunganService] ML server returned error for ${deviceId}: ${prediction.error}`);
            return;
        }
        // Save prediction result
        const predResult = await models_1.PredictionResult.create({
            device_id: deviceId,
            predicted_temperature: prediction.predicted_temperature,
            predicted_humidity: prediction.predicted_humidity,
            predicted_co2: prediction.predicted_co2
        });
        console.log(`[LingkunganService] Prediction saved: T=${prediction.predicted_temperature}°C, H=${prediction.predicted_humidity}%, CO2=${prediction.predicted_co2}ppm`);
        // Check predictive thresholds (Level 3 - Actuators)
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
const handleFirmwareSafetyCheck = async (data, device) => {
    // If ALL readings are below safe thresholds, turn off actuators
    if (data.temperature < SAFE_TEMP &&
        data.humidity < SAFE_HUMIDITY &&
        data.co2 < SAFE_CO2) {
        // Check if in manual override mode
        if (device.control_mode === 'MANUAL' &&
            device.manual_override_until) {
            const overrideExpiry = new Date(device.manual_override_until);
            if (overrideExpiry > new Date()) {
                console.log('[LingkunganService] Manual override active. Skipping safety deactivation.');
                return;
            }
            // Override expired, switch back to auto
            await device.update({
                control_mode: 'AUTO',
                manual_override_until: null
            });
        }
        // Turn off actuators via MQTT
        if (device.fan_state === 'ON' ||
            device.dehumidifier_state === 'ON') {
            console.log('[LingkunganService] Safety thresholds clear. Turning off actuators.');
            await (0, exports.sendActuatorCommand)(data.device_id, {
                fan: 'OFF',
                dehumidifier: 'OFF'
            }, device);
            await device.update({
                fan_state: 'OFF',
                dehumidifier_state: 'OFF'
            });
        }
    }
};
/**
 * Level 3: Predictive & Early Warning — activate actuators based on ML forecast (NO ALERTS).
 */
const handlePredictiveControl = async (deviceId, prediction) => {
    const device = await models_1.Device.findByPk(deviceId, {
        include: [{ model: models_1.Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
    });
    if (!device)
        return;
    // Check manual override
    if (device.control_mode === 'MANUAL' &&
        device.manual_override_until) {
        const overrideExpiry = new Date(device.manual_override_until);
        if (overrideExpiry > new Date()) {
            console.log('[LingkunganService] Manual override active. Skipping predictive control.');
            return;
        }
    }
    let triggerFan = false;
    let triggerDehumidifier = false;
    if (prediction.predicted_temperature > PREDICT_TEMP_THRESHOLD) {
        triggerFan = true;
    }
    if (prediction.predicted_humidity > PREDICT_HUMIDITY_THRESHOLD) {
        triggerDehumidifier = true;
    }
    if (prediction.predicted_co2 > PREDICT_CO2_THRESHOLD) {
        triggerFan = true;
    }
    if (triggerFan || triggerDehumidifier) {
        const command = {};
        if (triggerFan)
            command.fan = 'ON';
        if (triggerDehumidifier)
            command.dehumidifier = 'ON';
        await (0, exports.sendActuatorCommand)(deviceId, command, device);
        // Update device state
        const updateData = {};
        if (triggerFan)
            updateData.fan_state = 'ON';
        if (triggerDehumidifier)
            updateData.dehumidifier_state = 'ON';
        await device.update(updateData);
        // Update prediction record
        await models_1.PredictionResult.update({
            fan_triggered: triggerFan,
            dehumidifier_triggered: triggerDehumidifier
        }, {
            where: { device_id: deviceId },
            order: [['timestamp', 'DESC']],
            limit: 1
        });
    }
};
/**
 * Level 3: Threshold warning — SEND ALERTS based on ACTUAL readings exceeding thresholds (NO ACTUATORS).
 */
const handleActualThresholdControl = async (data, device) => {
    // Use passed device ensuring associations like 'area' are present
    // Check manual override
    if (device.control_mode === 'MANUAL' &&
        device.manual_override_until) {
        const overrideExpiry = new Date(device.manual_override_until);
        if (overrideExpiry > new Date()) {
            console.log('[LingkunganService] Manual override active. Skipping actual threshold control.');
            return;
        }
    }
    let triggerFan = false;
    let triggerDehumidifier = false;
    const alerts = [];
    if (data.temperature > PREDICT_TEMP_THRESHOLD) {
        triggerFan = true;
        alerts.push(`Suhu saat ini ${data.temperature.toFixed(1)}°C (> ${PREDICT_TEMP_THRESHOLD}°C)`);
    }
    if (data.humidity > PREDICT_HUMIDITY_THRESHOLD) {
        triggerDehumidifier = true;
        alerts.push(`Kelembapan saat ini ${data.humidity.toFixed(1)}% (> ${PREDICT_HUMIDITY_THRESHOLD}%)`);
    }
    if (data.co2 > PREDICT_CO2_THRESHOLD) {
        triggerFan = true;
        alerts.push(`CO2 saat ini ${data.co2.toFixed(0)}ppm (> ${PREDICT_CO2_THRESHOLD}ppm)`);
    }
    if (triggerFan || triggerDehumidifier) {
        // Send Telegram/Push notification based on actual data
        await alertingService.processLingkunganAlert(data.device_id, alerts, data);
    }
};
/**
 * Send actuator command to ESP32 via MQTT.
 */
const sendActuatorCommand = async (deviceId, command, device) => {
    // Use provided device or fetch if not available
    const deviceWithArea = device && device.area
        ? device
        : await models_1.Device.findByPk(deviceId, {
            include: [
                { model: models_1.Area, as: 'area', attributes: ['id', 'warehouse_id'] }
            ]
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
    // Set manual override mode with 5-minute expiry
    const overrideUntil = new Date(Date.now() + MANUAL_OVERRIDE_DURATION_MS);
    const updateData = {
        control_mode: 'MANUAL',
        manual_override_until: overrideUntil
    };
    if (command.fan)
        updateData.fan_state = command.fan;
    if (command.dehumidifier)
        updateData.dehumidifier_state = command.dehumidifier;
    await models_1.Device.update(updateData, { where: { id: deviceId } });
    // Send command to ESP32
    await (0, exports.sendActuatorCommand)(deviceId, command);
    console.log(`[LingkunganService] Manual override set until ${overrideUntil.toISOString()}`);
};
exports.handleManualControl = handleManualControl;
/**
 * Switch back to auto mode.
 */
const switchToAutoMode = async (deviceId) => {
    await models_1.Device.update({ control_mode: 'AUTO', manual_override_until: null }, { where: { id: deviceId } });
    console.log(`[LingkunganService] Switched to AUTO mode for device ${deviceId}`);
};
exports.switchToAutoMode = switchToAutoMode;
/**
 * Get lingkungan logs.
 */
const getLingkunganLogs = async (options) => {
    const { device_id, limit = 50, offset = 0, from, to } = options;
    const where = { device_id };
    if (from || to) {
        where.timestamp = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    const { count, rows } = await models_1.LingkunganLog.findAndCountAll({
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
exports.getLingkunganLogs = getLingkunganLogs;
/**
 * Get summary statistics.
 */
const getLingkunganSummary = async (device_id, from, to) => {
    const where = { device_id };
    if (from || to) {
        where.timestamp = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    const total_readings = await models_1.LingkunganLog.count({ where });
    // Get latest readings
    const latest = await models_1.LingkunganLog.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    // Get latest prediction
    const latestPrediction = await models_1.PredictionResult.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    // Get alerts count (unacknowledged)
    const unacknowledged = await models_1.LingkunganLog.count({
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
exports.getLingkunganSummary = getLingkunganSummary;
/**
 * Get chart data (actual vs predicted).
 */
const getChartData = async (device_id, from, to, limit = 100) => {
    const where = { device_id };
    if (from || to) {
        where.timestamp = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    console.log('[LingkunganService.getChartData]', {
        device_id,
        from,
        to,
        limit,
        whereClause: where
    });
    const actual = await models_1.LingkunganLog.findAll({
        where,
        attributes: ['timestamp', 'temperature', 'humidity', 'co2'],
        // Get newest first for efficient limiting, then reverse before returning.
        order: [['timestamp', 'DESC']],
        limit
    });
    const predictions = await models_1.PredictionResult.findAll({
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
exports.getChartData = getChartData;
/**
 * Get device status including control mode.
 */
const getLingkunganStatus = async (device_id) => {
    const device = await models_1.Device.findByPk(device_id);
    if (!device)
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan.');
    const latest = await models_1.LingkunganLog.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    const latestPrediction = await models_1.PredictionResult.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    // Determine overall status
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
    const log = await models_1.LingkunganLog.findByPk(logId);
    if (!log)
        throw new apiError_1.default(404, 'Log lingkungan tidak ditemukan.');
    log.status = status;
    log.notes = notes || log.notes;
    log.acknowledged_by = userId;
    log.acknowledged_at = new Date();
    await log.save();
    return log;
};
exports.updateLingkunganLogStatus = updateLingkunganLogStatus;
