"use strict";
/**
 * Tracks which actuators are currently ON and the reason (predictive, critical, or manual).
 * Prevents redundant commands and provides state visibility.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearActuatorCache = exports.shouldToggleActuator = exports.turnOffActuator = exports.turnOnActuator = exports.updateActuatorState = exports.getActuatorState = void 0;
const models_1 = require("../db/models");
// In-memory cache of actuator states per device
const actuatorStateCache = new Map();
/**
 * Get the current actuator state for a device
 */
const getActuatorState = (deviceId) => {
    if (!actuatorStateCache.has(deviceId)) {
        actuatorStateCache.set(deviceId, {
            fan_on: false,
            fan_reason: null,
            dehumidifier_on: false,
            dehumidifier_reason: null
        });
    }
    return actuatorStateCache.get(deviceId);
};
exports.getActuatorState = getActuatorState;
/**
 * Update actuator state with reason tracking
 */
const updateActuatorState = async (deviceId, updates) => {
    const state = (0, exports.getActuatorState)(deviceId);
    if (updates.fan_on !== undefined) {
        state.fan_on = updates.fan_on;
    }
    if (updates.fan_reason !== undefined) {
        state.fan_reason = updates.fan_reason;
    }
    if (updates.dehumidifier_on !== undefined) {
        state.dehumidifier_on = updates.dehumidifier_on;
    }
    if (updates.dehumidifier_reason !== undefined) {
        state.dehumidifier_reason = updates.dehumidifier_reason;
    }
    // Persist to database
    await models_1.Device.update({
        fan_state: state.fan_on ? 'ON' : 'OFF',
        dehumidifier_state: state.dehumidifier_on ? 'ON' : 'OFF',
        actuator_fan_on_reason: state.fan_reason,
        actuator_dehumidifier_on_reason: state.dehumidifier_reason
    }, { where: { id: deviceId } });
    console.log(`[ActuatorTracker] Device ${deviceId} state: fan=${state.fan_on ? 'ON' : 'OFF'} (${state.fan_reason}), dehumidifier=${state.dehumidifier_on ? 'ON' : 'OFF'} (${state.dehumidifier_reason})`);
    return state;
};
exports.updateActuatorState = updateActuatorState;
/**
 * Turn on an actuator with reason tracking.
 * Does not send command; caller must do that separately.
 */
const turnOnActuator = async (deviceId, actuator, reason) => {
    const state = (0, exports.getActuatorState)(deviceId);
    if (actuator === 'fan') {
        const wasOn = state.fan_on;
        state.fan_on = true;
        state.fan_reason = reason;
        if (!wasOn) {
            console.log(`[ActuatorTracker] Turning ON fan for device ${deviceId} (reason: ${reason})`);
        }
    }
    else if (actuator === 'dehumidifier') {
        const wasOn = state.dehumidifier_on;
        state.dehumidifier_on = true;
        state.dehumidifier_reason = reason;
        if (!wasOn) {
            console.log(`[ActuatorTracker] Turning ON dehumidifier for device ${deviceId} (reason: ${reason})`);
        }
    }
    // Persist to database
    await (0, exports.updateActuatorState)(deviceId, {
        [actuator === 'fan' ? 'fan_on' : 'dehumidifier_on']: true,
        [actuator === 'fan' ? 'fan_reason' : 'dehumidifier_reason']: reason
    });
    return state;
};
exports.turnOnActuator = turnOnActuator;
/**
 * Turn off an actuator
 */
const turnOffActuator = async (deviceId, actuator) => {
    const state = (0, exports.getActuatorState)(deviceId);
    if (actuator === 'fan') {
        const wasOn = state.fan_on;
        state.fan_on = false;
        state.fan_reason = null;
        if (wasOn) {
            console.log(`[ActuatorTracker] Turning OFF fan for device ${deviceId}`);
        }
    }
    else if (actuator === 'dehumidifier') {
        const wasOn = state.dehumidifier_on;
        state.dehumidifier_on = false;
        state.dehumidifier_reason = null;
        if (wasOn) {
            console.log(`[ActuatorTracker] Turning OFF dehumidifier for device ${deviceId}`);
        }
    }
    await (0, exports.updateActuatorState)(deviceId, {
        [actuator === 'fan' ? 'fan_on' : 'dehumidifier_on']: false,
        [actuator === 'fan' ? 'fan_reason' : 'dehumidifier_reason']: null
    });
    return state;
};
exports.turnOffActuator = turnOffActuator;
/**
 * Check if an actuator needs to be toggled
 */
const shouldToggleActuator = (deviceId, actuator, targetState) => {
    const state = (0, exports.getActuatorState)(deviceId);
    const currentState = actuator === 'fan' ? state.fan_on : state.dehumidifier_on;
    return currentState !== targetState;
};
exports.shouldToggleActuator = shouldToggleActuator;
/**
 * Clear the in-memory cache (useful for testing)
 */
const clearActuatorCache = () => {
    actuatorStateCache.clear();
};
exports.clearActuatorCache = clearActuatorCache;
