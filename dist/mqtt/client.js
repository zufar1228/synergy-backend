"use strict";
/**
 * @file client.ts
 * @purpose MQTT client orchestrator — connection lifecycle + delegated message routing
 * @usedBy server.ts (startup)
 * @deps mqtt, mqtt/connection, mqtt/messageRouter, mqtt/logger
 * @exports initializeMqttClient, client
 * @sideEffects MQTT connection/subscription, keepalive and health check timers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = exports.initializeMqttClient = void 0;
const connection_1 = require("./connection");
const logger_1 = require("./logger");
const messageRouter_1 = require("./messageRouter");
logger_1.log.info(`Broker: ${connection_1.MQTT_BROKER_URL}`);
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
// 120s is sufficient since device heartbeats (every 60s) also keep the broker awake.
const BROKER_KEEPALIVE_INTERVAL_MS = 120000; // 120 seconds
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
                    logger_1.log.warn('Keepalive publish failed:', err.message);
                else
                    logger_1.log.debug('Keepalive ping sent to broker');
            });
        }
    }, BROKER_KEEPALIVE_INTERVAL_MS);
};
const destroyAndRecreate = () => {
    logger_1.log.warn('Force-recreating MQTT client after too many failed reconnects...');
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
        logger_1.log.error('Error destroying old client:', e);
    }
    // Small delay before recreating to avoid tight loop
    setTimeout(() => {
        try {
            logger_1.log.info('Recreating MQTT client...');
            exports.client = client = (0, connection_1.createMqttClient)();
            registerEventHandlers(client);
            logger_1.log.info('MQTT client recreated successfully');
        }
        catch (err) {
            logger_1.log.error('Failed to recreate MQTT client:', err?.message);
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
            logger_1.log.warn(`Health check: MQTT disconnected. Reconnect attempts: ${consecutiveReconnects}`);
            if (consecutiveReconnects >= MAX_RECONNECT_ATTEMPTS_BEFORE_RECREATE) {
                destroyAndRecreate();
            }
        }
        else {
            logger_1.log.debug('Health check: MQTT connected OK');
            consecutiveReconnects = 0;
        }
    }, HEALTH_CHECK_INTERVAL_MS);
};
const registerEventHandlers = (mqttClient) => {
    // Event: Connect
    mqttClient.on('connect', (connack) => {
        logger_1.log.info('Connected to broker', { sessionPresent: connack.sessionPresent });
        isConnected = true;
        consecutiveReconnects = 0;
        lastConnectedAt = new Date();
        const sensorTopic = 'warehouses/+/areas/+/devices/+/sensors/#';
        const statusTopic = 'warehouses/+/areas/+/devices/+/status';
        // ML prediction traffic moved to direct HTTP — no longer subscribed via MQTT
        mqttClient.subscribe([sensorTopic, statusTopic], { qos: 1 }, (err, granted) => {
            if (err) {
                logger_1.log.error('Subscription error:', err.message);
            }
            else {
                logger_1.log.info('Subscribed to', granted?.length, 'topics');
                logger_1.log.debug('Granted:', granted);
            }
        });
        // Start keepalive pings to prevent EMQX Cloud Serverless from sleeping
        startBrokerKeepalive();
    });
    // Event: Message
    mqttClient.on('message', async (topic, payload, packet) => {
        try {
            await (0, messageRouter_1.routeIncomingMessage)(topic, payload, packet);
        }
        catch (messageError) {
            logger_1.log.error('Unhandled error in MQTT message pipeline:', messageError);
        }
    });
    // Event: Error
    mqttClient.on('error', (error) => {
        logger_1.log.error('Connection error:', error.message, error.code || '');
    });
    // Event: Reconnect
    mqttClient.on('reconnect', () => {
        consecutiveReconnects++;
        logger_1.log.info(`Reconnecting to broker... (attempt ${consecutiveReconnects})`);
    });
    // Event: Offline
    mqttClient.on('offline', () => {
        isConnected = false;
        logger_1.log.warn('Client is offline');
    });
    // Event: Close
    mqttClient.on('close', () => {
        isConnected = false;
        logger_1.log.info('Connection closed');
    });
    logger_1.log.info('Event handlers registered, connecting...');
};
const initializeMqttClient = () => {
    logger_1.log.info('Initializing MQTT client...');
    try {
        exports.client = client = (0, connection_1.createMqttClient)();
        logger_1.log.info('Client created, registering event handlers...');
        registerEventHandlers(client);
        // Start the health check monitor that force-recreates the client
        // if too many consecutive reconnection attempts fail.
        startHealthCheck();
        logger_1.log.info('MQTT client initialized with broker keepalive and health monitoring');
    }
    catch (error) {
        logger_1.log.error('Fatal error during MQTT initialization:', error);
        throw error;
    }
};
exports.initializeMqttClient = initializeMqttClient;
