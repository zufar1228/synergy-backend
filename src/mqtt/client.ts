/**
 * @file client.ts
 * @purpose MQTT client orchestrator — connection lifecycle + delegated message routing
 * @usedBy server.ts (startup)
 * @deps mqtt, mqtt/connection, mqtt/messageRouter, mqtt/logger
 * @exports initializeMqttClient, client
 * @sideEffects MQTT connection/subscription, keepalive and health check timers
 */

import mqtt from 'mqtt';
import { createMqttClient, MQTT_BROKER_URL } from './connection';
import { log } from './logger';
import { routeIncomingMessage } from './messageRouter';

log.info(`Broker: ${MQTT_BROKER_URL}`);

// Module-scoped client
let client: mqtt.MqttClient;

// Connection health tracking
let consecutiveReconnects = 0;
const MAX_RECONNECT_ATTEMPTS_BEFORE_RECREATE = 10;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let lastConnectedAt: Date | null = null;
let isConnected = false;

// Keepalive interval in ms — sends a lightweight ping to prevent EMQX Cloud
// Serverless from going idle and shutting down the broker.
// 120s is sufficient since device heartbeats (every 60s) also keep the broker awake.
const BROKER_KEEPALIVE_INTERVAL_MS = 120_000; // 120 seconds
const HEALTH_CHECK_INTERVAL_MS = 60_000; // 60 seconds

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
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  keepaliveInterval = setInterval(() => {
    if (client && isConnected) {
      client.publish(
        'backend/heartbeat',
        JSON.stringify({ ts: Date.now(), source: 'backend-subscriber' }),
        { qos: 0, retain: false },
        (err) => {
          if (err) log.warn('Keepalive publish failed:', err.message);
          else log.debug('Keepalive ping sent to broker');
        }
      );
    }
  }, BROKER_KEEPALIVE_INTERVAL_MS);
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
  } catch (e) {
    log.error('Error destroying old client:', e);
  }

  // Small delay before recreating to avoid tight loop
  setTimeout(() => {
    try {
      log.info('Recreating MQTT client...');
      client = createMqttClient();
      registerEventHandlers(client);
      log.info('MQTT client recreated successfully');
    } catch (err: any) {
      log.error('Failed to recreate MQTT client:', err?.message);
      // Try again after a longer delay
      setTimeout(destroyAndRecreate, 30_000);
    }
  }, 5_000);
};

const startHealthCheck = () => {
  if (healthCheckInterval) clearInterval(healthCheckInterval);
  healthCheckInterval = setInterval(() => {
    if (!isConnected) {
      log.warn(
        `Health check: MQTT disconnected. Reconnect attempts: ${consecutiveReconnects}`
      );
      if (consecutiveReconnects >= MAX_RECONNECT_ATTEMPTS_BEFORE_RECREATE) {
        destroyAndRecreate();
      }
    } else {
      log.debug('Health check: MQTT connected OK');
      consecutiveReconnects = 0;
    }
  }, HEALTH_CHECK_INTERVAL_MS);
};

const registerEventHandlers = (mqttClient: mqtt.MqttClient) => {
  // Event: Connect
  mqttClient.on('connect', (connack) => {
    log.info('Connected to broker', { sessionPresent: connack.sessionPresent });
    isConnected = true;
    consecutiveReconnects = 0;
    lastConnectedAt = new Date();

    const sensorTopic = 'warehouses/+/areas/+/devices/+/sensors/#';
    const statusTopic = 'warehouses/+/areas/+/devices/+/status';

    // ML prediction traffic moved to direct HTTP — no longer subscribed via MQTT
    mqttClient.subscribe(
      [sensorTopic, statusTopic],
      { qos: 1 },
      (err, granted) => {
        if (err) {
          log.error('Subscription error:', err.message);
        } else {
          log.info('Subscribed to', granted?.length, 'topics');
          log.debug('Granted:', granted);
        }
      }
    );

    // Start keepalive pings to prevent EMQX Cloud Serverless from sleeping
    startBrokerKeepalive();
  });

  // Event: Message
  mqttClient.on('message', async (topic, payload, packet) => {
    try {
      await routeIncomingMessage(topic, payload, packet);
    } catch (messageError) {
      log.error('Unhandled error in MQTT message pipeline:', messageError);
    }
  });

  // Event: Error
  mqttClient.on('error', (error) => {
    log.error('Connection error:', error.message, (error as any).code || '');
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

export const initializeMqttClient = () => {
  log.info('Initializing MQTT client...');

  try {
    client = createMqttClient();
    log.info('Client created, registering event handlers...');
    registerEventHandlers(client);

    // Start the health check monitor that force-recreates the client
    // if too many consecutive reconnection attempts fail.
    startHealthCheck();

    log.info(
      'MQTT client initialized with broker keepalive and health monitoring'
    );
  } catch (error) {
    log.error('Fatal error during MQTT initialization:', error);
    throw error;
  }
};

export { client };
