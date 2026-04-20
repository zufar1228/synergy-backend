"use strict";
/**
 * @file connection.ts
 * @purpose MQTT broker connection factory and constants
 * @usedBy mqtt client orchestrator
 * @deps mqtt, env
 * @exports MQTT_BROKER_URL, MQTT_CLIENT_ID, createMqttClient
 * @sideEffects Opens MQTT connection when createMqttClient is called
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMqttClient = exports.MQTT_CLIENT_ID = exports.MQTT_BROKER_URL = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const env_1 = require("../config/env");
const MQTT_HOST = env_1.env.MQTT_HOST;
const MQTT_USERNAME = env_1.env.MQTT_USERNAME;
const MQTT_PASSWORD = env_1.env.MQTT_PASSWORD;
exports.MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;
exports.MQTT_CLIENT_ID = `synergy-backend-${env_1.env.NODE_ENV ?? 'dev'}`;
const createMqttClient = () => {
    const options = {
        clientId: exports.MQTT_CLIENT_ID,
        username: MQTT_USERNAME,
        password: MQTT_PASSWORD,
        // Keep clean=true so offline queue replay cannot produce false online state.
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        keepalive: 60
    };
    return mqtt_1.default.connect(exports.MQTT_BROKER_URL, options);
};
exports.createMqttClient = createMqttClient;
