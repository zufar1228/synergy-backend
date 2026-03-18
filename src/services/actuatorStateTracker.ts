/**
 * Tracks which actuators are currently ON and the reason (predictive, critical, or manual).
 * Prevents redundant commands and provides state visibility.
 */

import { Device } from '../db/models';

export type ActuatorReason =
  | 'predictive'
  | 'critical'
  | 'manual'
  | 'firmware_safety'
  | null;

interface ActuatorState {
  fan_on: boolean;
  fan_reason: ActuatorReason;
  dehumidifier_on: boolean;
  dehumidifier_reason: ActuatorReason;
}

// In-memory cache of actuator states per device
const actuatorStateCache = new Map<string, ActuatorState>();

/**
 * Get the current actuator state for a device
 */
export const getActuatorState = (deviceId: string): ActuatorState => {
  if (!actuatorStateCache.has(deviceId)) {
    actuatorStateCache.set(deviceId, {
      fan_on: false,
      fan_reason: null,
      dehumidifier_on: false,
      dehumidifier_reason: null
    });
  }
  return actuatorStateCache.get(deviceId)!;
};

/**
 * Update actuator state with reason tracking
 */
export const updateActuatorState = async (
  deviceId: string,
  updates: {
    fan_on?: boolean;
    fan_reason?: ActuatorReason;
    dehumidifier_on?: boolean;
    dehumidifier_reason?: ActuatorReason;
  }
) => {
  const state = getActuatorState(deviceId);

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
  await Device.update(
    {
      fan_state: state.fan_on ? 'ON' : 'OFF',
      dehumidifier_state: state.dehumidifier_on ? 'ON' : 'OFF',
      actuator_fan_on_reason: state.fan_reason,
      actuator_dehumidifier_on_reason: state.dehumidifier_reason
    },
    { where: { id: deviceId } }
  );

  console.log(
    `[ActuatorTracker] Device ${deviceId} state: fan=${state.fan_on ? 'ON' : 'OFF'} (${state.fan_reason}), dehumidifier=${state.dehumidifier_on ? 'ON' : 'OFF'} (${state.dehumidifier_reason})`
  );

  return state;
};

/**
 * Turn on an actuator with reason tracking.
 * Does not send command; caller must do that separately.
 */
export const turnOnActuator = async (
  deviceId: string,
  actuator: 'fan' | 'dehumidifier',
  reason: ActuatorReason
) => {
  const state = getActuatorState(deviceId);

  if (actuator === 'fan') {
    const wasOn = state.fan_on;
    state.fan_on = true;
    state.fan_reason = reason;
    if (!wasOn) {
      console.log(
        `[ActuatorTracker] Turning ON fan for device ${deviceId} (reason: ${reason})`
      );
    }
  } else if (actuator === 'dehumidifier') {
    const wasOn = state.dehumidifier_on;
    state.dehumidifier_on = true;
    state.dehumidifier_reason = reason;
    if (!wasOn) {
      console.log(
        `[ActuatorTracker] Turning ON dehumidifier for device ${deviceId} (reason: ${reason})`
      );
    }
  }

  // Persist to database
  await updateActuatorState(deviceId, {
    [actuator === 'fan' ? 'fan_on' : 'dehumidifier_on']: true,
    [actuator === 'fan' ? 'fan_reason' : 'dehumidifier_reason']: reason
  });

  return state;
};

/**
 * Turn off an actuator
 */
export const turnOffActuator = async (
  deviceId: string,
  actuator: 'fan' | 'dehumidifier'
) => {
  const state = getActuatorState(deviceId);

  if (actuator === 'fan') {
    const wasOn = state.fan_on;
    state.fan_on = false;
    state.fan_reason = null;
    if (wasOn) {
      console.log(`[ActuatorTracker] Turning OFF fan for device ${deviceId}`);
    }
  } else if (actuator === 'dehumidifier') {
    const wasOn = state.dehumidifier_on;
    state.dehumidifier_on = false;
    state.dehumidifier_reason = null;
    if (wasOn) {
      console.log(
        `[ActuatorTracker] Turning OFF dehumidifier for device ${deviceId}`
      );
    }
  }

  await updateActuatorState(deviceId, {
    [actuator === 'fan' ? 'fan_on' : 'dehumidifier_on']: false,
    [actuator === 'fan' ? 'fan_reason' : 'dehumidifier_reason']: null
  });

  return state;
};

/**
 * Check if an actuator needs to be toggled
 */
export const shouldToggleActuator = (
  deviceId: string,
  actuator: 'fan' | 'dehumidifier',
  targetState: boolean
): boolean => {
  const state = getActuatorState(deviceId);
  const currentState =
    actuator === 'fan' ? state.fan_on : state.dehumidifier_on;
  return currentState !== targetState;
};

/**
 * Clear the in-memory cache (useful for testing)
 */
export const clearActuatorCache = () => {
  actuatorStateCache.clear();
};
