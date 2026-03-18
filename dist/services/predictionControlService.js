"use strict";
/**
 * Prediction Control Service
 *
 * Evaluates ML prediction results against thresholds and determines
 * if actuators should be triggered predictively.
 *
 * Thresholds (from environment or defaults):
 * - Temperature: >= 35°C → activate fan
 * - Humidity: >= 80% → activate dehumidifier
 * - CO2: >= 1500 ppm → activate fan
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluatePredictionAndControl = void 0;
const models_1 = require("../db/models");
const actuatorStateTracker = __importStar(require("./actuatorStateTracker"));
const predictionAlertService = __importStar(require("./predictionAlertService"));
const lingkunganService = __importStar(require("./lingkunganService"));
// Hardcoded thresholds for predictive actuation
const PREDICT_TEMP_THRESHOLD = 35; //°C
const PREDICT_HUMIDITY_THRESHOLD = 80; // %
const PREDICT_CO2_THRESHOLD = 1500; // ppm
/**
 * Evaluate prediction result and trigger actuators if thresholds exceeded.
 */
const evaluatePredictionAndControl = async (deviceId, prediction) => {
    try {
        const device = await models_1.Device.findByPk(deviceId, {
            include: [{ model: models_1.Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
        });
        if (!device) {
            console.error(`[PredictionControl] Device ${deviceId} not found`);
            return;
        }
        // Check manual override
        if (device.control_mode === 'MANUAL' &&
            device.manual_override_until) {
            const overrideExpiry = new Date(device.manual_override_until);
            if (overrideExpiry > new Date()) {
                console.log('[PredictionControl] Manual override active. Skipping predictive control.');
                return;
            }
            // Override expired, switch back to AUTO
            await device.update({
                control_mode: 'AUTO',
                manual_override_until: null
            });
        }
        let shouldTriggerFan = false;
        let shouldTriggerDehumidifier = false;
        const triggeredReasons = [];
        // Evaluate thresholds
        if (prediction.predicted_temperature >= PREDICT_TEMP_THRESHOLD) {
            shouldTriggerFan = true;
            triggeredReasons.push(`Prediksi Suhu ${prediction.predicted_temperature.toFixed(1)}°C (>= ${PREDICT_TEMP_THRESHOLD}°C)`);
        }
        if (prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD) {
            shouldTriggerDehumidifier = true;
            triggeredReasons.push(`Prediksi Kelembapan ${prediction.predicted_humidity.toFixed(1)}% (>= ${PREDICT_HUMIDITY_THRESHOLD}%)`);
        }
        if (prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD) {
            shouldTriggerFan = true;
            triggeredReasons.push(`Prediksi CO2 ${prediction.predicted_co2.toFixed(0)}ppm (>= ${PREDICT_CO2_THRESHOLD}ppm)`);
        }
        // Execute actuation commands
        if (shouldTriggerFan || shouldTriggerDehumidifier) {
            const command = {};
            if (shouldTriggerFan &&
                actuatorStateTracker.shouldToggleActuator(deviceId, 'fan', true)) {
                command.fan = 'ON';
                await actuatorStateTracker.turnOnActuator(deviceId, 'fan', 'predictive');
            }
            if (shouldTriggerDehumidifier &&
                actuatorStateTracker.shouldToggleActuator(deviceId, 'dehumidifier', true)) {
                command.dehumidifier = 'ON';
                await actuatorStateTracker.turnOnActuator(deviceId, 'dehumidifier', 'predictive');
            }
            // Send command to ESP32 via MQTT
            if (Object.keys(command).length > 0) {
                await lingkunganService.sendActuatorCommand(deviceId, command, device);
            }
            // Update prediction record with triggers
            await models_1.PredictionResult.update({
                fan_triggered: shouldTriggerFan,
                dehumidifier_triggered: shouldTriggerDehumidifier
            }, {
                where: { device_id: deviceId },
                order: [['timestamp', 'DESC']],
                limit: 1
            });
            // Store latest predictions in device record
            await device.update({
                last_prediction_temperature: prediction.predicted_temperature,
                last_prediction_humidity: prediction.predicted_humidity,
                last_prediction_co2: prediction.predicted_co2
            });
            // Send Telegram alert about prediction-triggered actuation
            await predictionAlertService.sendPredictionAlert(deviceId, device, prediction, triggeredReasons);
        }
        else {
            // Store predictions even if thresholds not exceeded
            await device.update({
                last_prediction_temperature: prediction.predicted_temperature,
                last_prediction_humidity: prediction.predicted_humidity,
                last_prediction_co2: prediction.predicted_co2
            });
        }
    }
    catch (error) {
        console.error('[PredictionControl] Error evaluating prediction:', error.message);
    }
};
exports.evaluatePredictionAndControl = evaluatePredictionAndControl;
