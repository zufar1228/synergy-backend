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
exports.client = exports.initializeMqttClient = void 0;
// backend/src/mqtt/client.ts
const mqtt_1 = __importDefault(require("mqtt"));
const intrusiService = __importStar(require("../features/intrusi/services/intrusiService"));
const lingkunganService = __importStar(require("../features/lingkungan/services/lingkunganService"));
const deviceService_1 = require("../services/deviceService");
const intrusiAlertingService = __importStar(require("../features/intrusi/services/intrusiAlertingService"));
// Simple log-level utility
const LOG_LEVEL = process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[LOG_LEVEL] ?? 1;
const log = {
    debug: (...args) => currentLevel <= 0 && console.log('[MQTT]', ...args),
    info: (...args) => currentLevel <= 1 && console.log('[MQTT]', ...args),
    warn: (...args) => currentLevel <= 2 && console.warn('[MQTT]', ...args),
    error: (...args) => currentLevel <= 3 && console.error('[MQTT]', ...args)
};
// Environment variables
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
// Validate
log.info('Checking env vars:', {
    MQTT_HOST: MQTT_HOST ? '✅' : '❌',
    MQTT_USERNAME: MQTT_USERNAME ? '✅' : '❌',
    MQTT_PASSWORD: MQTT_PASSWORD ? '✅' : '❌'
});
if (!MQTT_HOST || !MQTT_USERNAME || !MQTT_PASSWORD) {
    throw new Error('Missing required MQTT environment variables (MQTT_HOST, MQTT_USERNAME, MQTT_PASSWORD)');
}
const MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;
log.info(`Broker: ${MQTT_BROKER_URL}, User: ${MQTT_USERNAME}`);
// Module-scoped client
let client;
// Connection health tracking
let consecutiveReconnects = 0;
const MAX_RECONNECT_ATTEMPTS_BEFORE_RECREATE = 10;
let keepaliveInterval = null;
let healthCheckInterval = null;
let lastConnectedAt = null;
let isConnected = false;
// Keepalive interval in ms — sends a lightweight ping to prevent EMQX Cloud
// Serverless from going idle and shutting down the broker.
const BROKER_KEEPALIVE_INTERVAL_MS = 30000; // 30 seconds
const HEALTH_CHECK_INTERVAL_MS = 60000; // 60 seconds
const stopTimers = () => {
    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }
};
const startBrokerKeepalive = () => {
    if (keepaliveInterval)
        clearInterval(keepaliveInterval);
    keepaliveInterval = setInterval(() => {
        if (client && isConnected) {
            client.publish('backend/heartbeat', JSON.stringify({ ts: Date.now(), source: 'backend-subscriber' }), { qos: 0, retain: false }, (err) => {
                if (err)
                    log.warn('Keepalive publish failed:', err.message);
                else
                    log.debug('Keepalive ping sent to broker');
            });
        }
    }, BROKER_KEEPALIVE_INTERVAL_MS);
};
const createClient = () => {
    const options = {
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        keepalive: 60
    };
    return mqtt_1.default.connect(MQTT_BROKER_URL, options);
};
const destroyAndRecreate = () => {
    log.warn('Force-recreating MQTT client after too many failed reconnects...');
    stopTimers();
    isConnected = false;
    consecutiveReconnects = 0;
    try {
        if (client) {
            client.removeAllListeners();
            client.end(true);
        }
    }
    catch (e) {
        log.error('Error destroying old client:', e);
    }
    // Small delay before recreating to avoid tight loop
    setTimeout(() => {
        try {
            log.info('Recreating MQTT client...');
            exports.client = client = createClient();
            registerEventHandlers(client);
            log.info('MQTT client recreated successfully');
        }
        catch (err) {
            log.error('Failed to recreate MQTT client:', err?.message);
            // Try again after a longer delay
            setTimeout(destroyAndRecreate, 30000);
        }
    }, 5000);
};
const startHealthCheck = () => {
    if (healthCheckInterval)
        clearInterval(healthCheckInterval);
    healthCheckInterval = setInterval(() => {
        if (!isConnected) {
            log.warn(`Health check: MQTT disconnected. Reconnect attempts: ${consecutiveReconnects}`);
            if (consecutiveReconnects >= MAX_RECONNECT_ATTEMPTS_BEFORE_RECREATE) {
                destroyAndRecreate();
            }
        }
        else {
            log.debug('Health check: MQTT connected OK');
            consecutiveReconnects = 0;
        }
    }, HEALTH_CHECK_INTERVAL_MS);
};
const registerEventHandlers = (mqttClient) => {
    // Event: Connect
    mqttClient.on('connect', (connack) => {
        log.info('Connected to broker', { sessionPresent: connack.sessionPresent });
        isConnected = true;
        consecutiveReconnects = 0;
        lastConnectedAt = new Date();
        const sensorTopic = 'warehouses/+/areas/+/devices/+/sensors/#';
        const statusTopic = 'warehouses/+/areas/+/devices/+/status';
        const mlResponseTopic = 'synergy/ml/predict/response/+';
        const mlStatusTopic = 'synergy/ml/status';
        mqttClient.subscribe([sensorTopic, statusTopic, mlResponseTopic, mlStatusTopic], { qos: 1 }, (err, granted) => {
            if (err) {
                log.error('Subscription error:', err.message);
            }
            else {
                log.info('Subscribed to', granted?.length, 'topics');
                log.debug('Granted:', granted);
            }
        });
        // Start keepalive pings to prevent EMQX Cloud Serverless from sleeping
        startBrokerKeepalive();
    });
    // Event: Message
    mqttClient.on('message', async (topic, payload) => {
        log.debug('Message received:', topic);
        try {
            const topicParts = topic.split('/');
            const message = payload.toString();
            // Handle ML prediction responses
            if (topic.startsWith('synergy/ml/predict/response/')) {
                const deviceId = topicParts[4];
                log.debug('ML prediction response for device:', deviceId);
                try {
                    const prediction = JSON.parse(message);
                    await lingkunganService.handlePredictionResult(deviceId, prediction);
                    log.debug('ML prediction processed for', deviceId);
                }
                catch (parseErr) {
                    log.error('Failed to parse ML prediction response:', parseErr);
                }
                return;
            }
            // Handle ML server status
            if (topic === 'synergy/ml/status') {
                try {
                    const status = JSON.parse(message);
                    log.info(`ML Server: ${status.status} (model: ${status.model_loaded ? '✅' : '❌'}, scaler: ${status.scaler_loaded ? '✅' : '❌'})`);
                }
                catch {
                    log.info('ML Server status:', message);
                }
                return;
            }
            // Handle device topics (sensor data, heartbeats)
            if (topicParts.length < 7) {
                log.warn('Invalid topic format (too short):', topic);
                return;
            }
            const deviceId = topicParts[5];
            // Status/heartbeat messages
            if (topicParts.length === 7 && topicParts[6] === 'status') {
                log.debug('Heartbeat from', deviceId);
                let extraFields;
                try {
                    const statusData = JSON.parse(message);
                    // Detect intrusi-specific fields
                    if (statusData.door ||
                        statusData.state ||
                        statusData.siren ||
                        statusData.power ||
                        statusData.vbat_v !== undefined) {
                        extraFields = {};
                        if (statusData.door)
                            extraFields.door_state = statusData.door;
                        if (statusData.state)
                            extraFields.intrusi_system_state = statusData.state;
                        if (statusData.siren)
                            extraFields.siren_state = statusData.siren;
                        if (statusData.power)
                            extraFields.power_source = statusData.power;
                        if (statusData.vbat_v !== undefined)
                            extraFields.vbat_voltage = parseFloat(statusData.vbat_v);
                        if (statusData.vbat_pct !== undefined)
                            extraFields.vbat_pct = parseInt(statusData.vbat_pct, 10);
                        log.debug('Intrusi status fields:', extraFields);
                    }
                    // Lingkungan-specific state fields
                    extraFields = extraFields || {};
                    if (statusData.fan !== undefined) {
                        extraFields.fan_state = statusData.fan;
                    }
                    if (statusData.dehumidifier !== undefined) {
                        extraFields.dehumidifier_state = statusData.dehumidifier;
                    }
                    // For control_mode: only accept from ESP32 if the backend does NOT
                    // currently have an active manual override.  The backend API is the
                    // source of truth for mode changes — blindly accepting the ESP32's
                    // mode would overwrite it (e.g. ESP32 sends AUTO before receiving
                    // the MANUAL command).
                    if (statusData.mode !== undefined) {
                        try {
                            const { Device } = await Promise.resolve().then(() => __importStar(require('../db/models')));
                            const currentDevice = await Device.findByPk(deviceId, {
                                attributes: ['control_mode', 'manual_override_until']
                            });
                            const hasActiveOverride = currentDevice &&
                                currentDevice.control_mode === 'MANUAL' &&
                                currentDevice.manual_override_until &&
                                new Date(currentDevice.manual_override_until) > new Date();
                            if (!hasActiveOverride) {
                                extraFields.control_mode = statusData.mode;
                            }
                            else {
                                log.debug('Skipping control_mode update from ESP32 — active manual override for', deviceId);
                            }
                        }
                        catch (modeErr) {
                            log.error('Error checking manual override:', modeErr);
                            // Fallback: accept ESP32 mode if DB check fails
                            extraFields.control_mode = statusData.mode;
                        }
                    }
                    // Process power/battery alerts
                    if (statusData.power || statusData.vbat_pct !== undefined) {
                        try {
                            await intrusiAlertingService.processPowerAlert(deviceId, {
                                power_source: statusData.power,
                                vbat_v: statusData.vbat_v !== undefined
                                    ? parseFloat(statusData.vbat_v)
                                    : undefined,
                                vbat_pct: statusData.vbat_pct !== undefined
                                    ? parseInt(statusData.vbat_pct, 10)
                                    : undefined
                            });
                        }
                        catch (alertErr) {
                            log.error('Power alert processing error:', alertErr);
                        }
                    }
                }
                catch {
                    // Non-JSON heartbeat — that's fine, just update heartbeat
                }
                await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, extraFields);
                log.debug('Heartbeat processed for', deviceId);
                return;
            }
            // Sensor data messages
            if (topicParts.length === 8 && topicParts[6] === 'sensors') {
                const systemType = topicParts[7];
                log.debug('Sensor data from', deviceId, 'type:', systemType);
                const data = JSON.parse(message);
                if (systemType === 'intrusi') {
                    // Derive siren_state from event type
                    let derivedSirenState;
                    if (data.type === 'SIREN_SILENCED') {
                        derivedSirenState = 'COOLDOWN';
                    }
                    else if (data.type === 'FORCED_ENTRY_ALARM' ||
                        data.type === 'UNAUTHORIZED_OPEN') {
                        derivedSirenState = 'ON';
                    }
                    else if (data.type === 'DISARM') {
                        derivedSirenState = 'OFF';
                    }
                    await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, {
                        door_state: data.door || undefined,
                        intrusi_system_state: data.state || undefined,
                        ...(derivedSirenState && { siren_state: derivedSirenState })
                    });
                    await intrusiService.ingestIntrusiEvent({
                        device_id: deviceId,
                        event_type: data.type,
                        system_state: data.state || 'ARMED',
                        door_state: data.door || 'CLOSED',
                        peak_delta_g: data.peak_delta_g ?? null,
                        hit_count: data.hit_count ?? null,
                        payload: data
                    });
                    log.info('Intrusi event saved:', data.type, 'device:', deviceId);
                    // Process alerts for alarm events
                    const alarmEvents = ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'];
                    if (alarmEvents.includes(data.type)) {
                        log.info('Alarm event detected, processing alerts...');
                        await intrusiAlertingService.processIntrusiAlert(deviceId, data);
                    }
                }
                else if (systemType === 'lingkungan') {
                    await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, {
                        last_temperature: data.temperature,
                        last_humidity: data.humidity,
                        last_co2: data.co2
                    });
                    await lingkunganService.ingestSensorData({
                        device_id: deviceId,
                        temperature: data.temperature,
                        humidity: data.humidity,
                        co2: data.co2
                    });
                    log.info('Lingkungan data saved for device:', deviceId);
                }
                else {
                    log.warn('Unknown system type:', systemType);
                }
                return;
            }
            log.warn('Unhandled topic format:', topic);
        }
        catch (error) {
            if (error instanceof Error) {
                log.error('Error processing message:', error.message);
                log.debug('Stack:', error.stack);
            }
            else {
                log.error('Unknown error processing message:', error);
            }
        }
    });
    // Event: Error
    mqttClient.on('error', (error) => {
        log.error('Connection error:', error.message, error.code || '');
    });
    // Event: Reconnect
    mqttClient.on('reconnect', () => {
        consecutiveReconnects++;
        log.info(`Reconnecting to broker... (attempt ${consecutiveReconnects})`);
    });
    // Event: Offline
    mqttClient.on('offline', () => {
        isConnected = false;
        log.warn('Client is offline');
    });
    // Event: Close
    mqttClient.on('close', () => {
        isConnected = false;
        log.info('Connection closed');
    });
    log.info('Event handlers registered, connecting...');
};
const initializeMqttClient = () => {
    log.info('Initializing MQTT client...');
    try {
        exports.client = client = createClient();
        log.info('Client created, registering event handlers...');
        registerEventHandlers(client);
        // Start the health check monitor that force-recreates the client
        // if too many consecutive reconnection attempts fail.
        startHealthCheck();
        log.info('MQTT client initialized with broker keepalive and health monitoring');
    }
    catch (error) {
        log.error('Fatal error during MQTT initialization:', error);
        throw error;
    }
};
exports.initializeMqttClient = initializeMqttClient;
