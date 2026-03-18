"use strict";
/**
 * Stability Alert Service
 *
 * Detects when environmental conditions have returned to safe/stable levels
 * and automatically turns off actuators. Sends confirmation notification.
 *
 * Safe/Stable thresholds:
 * - Temperature: <= 30°C
 * - Humidity: <= 75%
 * - CO2: <= 1200 ppm
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
exports.getStableReadingCount = exports.clearStableCounter = exports.checkStabilityAndTurnOff = void 0;
const models_1 = require("../db/models");
const actuatorStateTracker = __importStar(require("./actuatorStateTracker"));
const telegramService = __importStar(require("./telegramService"));
const lingkunganService = __importStar(require("./lingkunganService"));
// Hardcoded thresholds for stability detection
const SAFE_TEMP = 30; // °C
const SAFE_HUMIDITY = 75; // %
const SAFE_CO2 = 1200; // ppm
// Track consecutive stable readings to prevent premature turn-off
const stableReadingCount = new Map();
const STABLE_READINGS_THRESHOLD = 3; // Require 3 consecutive stable readings
/**
 * Check if conditions are stable and turn off actuators if needed
 */
const checkStabilityAndTurnOff = async (deviceId, currentData) => {
    try {
        const device = await models_1.Device.findByPk(deviceId, {
            include: [{ association: 'area' }]
        });
        if (!device) {
            console.error(`[StabilityAlert] Device ${deviceId} not found`);
            return;
        }
        // Check if all readings are below safe thresholds
        const isStable = currentData.temperature <= SAFE_TEMP &&
            currentData.humidity <= SAFE_HUMIDITY &&
            currentData.co2 <= SAFE_CO2;
        if (!isStable) {
            // Reset counter if conditions are not stable
            stableReadingCount.set(deviceId, 0);
            return;
        }
        // Increment stable reading counter
        const currentCount = stableReadingCount.get(deviceId) || 0;
        const newCount = currentCount + 1;
        stableReadingCount.set(deviceId, newCount);
        console.log(`[StabilityAlert] Stable condition detected for ${deviceId} (${newCount}/${STABLE_READINGS_THRESHOLD})`);
        // Check if we've reached the threshold
        if (newCount < STABLE_READINGS_THRESHOLD) {
            return;
        }
        // Reset counter after threshold reached
        stableReadingCount.set(deviceId, 0);
        // Check manual override
        if (device.control_mode === 'MANUAL' &&
            device.manual_override_until) {
            const overrideExpiry = new Date(device.manual_override_until);
            if (overrideExpiry > new Date()) {
                console.log('[StabilityAlert] Manual override active. Skipping stability turn-off.');
                return;
            }
            // Override expired, switch back to AUTO
            await device.update({
                control_mode: 'AUTO',
                manual_override_until: null
            });
        }
        // Get current actuator state
        const state = actuatorStateTracker.getActuatorState(deviceId);
        // Determine which actuators to turn off
        let shouldTurnOffFan = state.fan_on;
        let shouldTurnOffDehumidifier = state.dehumidifier_on;
        if (!shouldTurnOffFan && !shouldTurnOffDehumidifier) {
            // Actuators already off
            return;
        }
        // Send turn-off command to ESP32
        const command = {};
        if (shouldTurnOffFan) {
            command.fan = 'OFF';
            await actuatorStateTracker.turnOffActuator(deviceId, 'fan');
        }
        if (shouldTurnOffDehumidifier) {
            command.dehumidifier = 'OFF';
            await actuatorStateTracker.turnOffActuator(deviceId, 'dehumidifier');
        }
        // Send command via MQTT
        await lingkunganService.sendActuatorCommand(deviceId, command, device);
        // Send confirmation alert
        await sendStabilityConfirmation(deviceId, device, currentData);
    }
    catch (error) {
        console.error('[StabilityAlert] Error checking stability:', error.message);
    }
};
exports.checkStabilityAndTurnOff = checkStabilityAndTurnOff;
/**
 * Send confirmation Telegram alert when conditions stabilize
 */
const sendStabilityConfirmation = async (deviceId, device, currentData) => {
    try {
        const area = device.area;
        const warehouse = area?.warehouse;
        const warehouseName = warehouse?.name || 'Tidak Diketahui';
        const areaName = area?.name || 'Tidak Diketahui';
        const deviceName = device.name || deviceId;
        const message = `
✅ <b>KONDISI LINGKUNGAN STABIL</b> ✅

📍 <b>Lokasi:</b> ${warehouseName} - ${areaName}
🔧 <b>Device:</b> ${deviceName}

📊 <b>Pembacaan Saat Ini:</b>
   • Suhu: ${currentData.temperature.toFixed(1)}°C (target: <= ${SAFE_TEMP}°C)
   • Kelembapan: ${currentData.humidity.toFixed(1)}% (target: <= ${SAFE_HUMIDITY}%)
   • CO2: ${currentData.co2.toFixed(0)}ppm (target: <= ${SAFE_CO2}ppm)

✓ <b>Aksi yang Diambil:</b>
   ✓ Kipas dimatikan
   ✓ Dehumidifier dimatikan
   ✓ Semua aktuator dalam status OFF

🕐 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}

<i>Lingkungan kembali normal. Sistem dalam mode otomatis.</i>
`.trim();
        await telegramService.sendGroupAlert(message);
        console.log(`[StabilityAlert] Stability confirmation sent for device ${deviceId}`);
    }
    catch (error) {
        console.error('[StabilityAlert] Failed to send confirmation:', error.message);
    }
};
/**
 * Clear stable reading counter (for testing)
 */
const clearStableCounter = (deviceId) => {
    if (deviceId) {
        stableReadingCount.delete(deviceId);
    }
    else {
        stableReadingCount.clear();
    }
};
exports.clearStableCounter = clearStableCounter;
/**
 * Get stable reading count for a device
 */
const getStableReadingCount = (deviceId) => {
    return stableReadingCount.get(deviceId) || 0;
};
exports.getStableReadingCount = getStableReadingCount;
