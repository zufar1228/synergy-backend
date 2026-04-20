/**
 * @file connection.ts
 * @purpose MQTT broker connection factory and constants
 * @usedBy mqtt client orchestrator
 * @deps mqtt, env
 * @exports MQTT_BROKER_URL, MQTT_CLIENT_ID, createMqttClient
 * @sideEffects Opens MQTT connection when createMqttClient is called
 */

import mqtt from 'mqtt';
import { env } from '../config/env';

const MQTT_HOST = env.MQTT_HOST;
const MQTT_USERNAME = env.MQTT_USERNAME;
const MQTT_PASSWORD = env.MQTT_PASSWORD;

export const MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;
export const MQTT_CLIENT_ID = `synergy-backend-${env.NODE_ENV ?? 'dev'}`;

export const createMqttClient = (): mqtt.MqttClient => {
  const options: mqtt.IClientOptions = {
    clientId: MQTT_CLIENT_ID,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    // Keep clean=true so offline queue replay cannot produce false online state.
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    keepalive: 60
  };

  return mqtt.connect(MQTT_BROKER_URL, options);
};
