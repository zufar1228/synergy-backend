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
exports.initializeMqttClient = void 0;
// backend/src/mqtt/client.ts
const mqtt_1 = __importDefault(require("mqtt"));
const logService = __importStar(require("../services/logService"));
const deviceService_1 = require("../services/deviceService");
const alertingService = __importStar(require("../services/alertingService"));
// Gunakan broker publik HiveMQ untuk development.
// PENTING: Jangan gunakan ini untuk produksi karena tidak aman.
const MQTT_BROKER_URL = `mqtts://${process.env.MQTT_HOST}:8883`;
const options = {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
};
const initializeMqttClient = () => {
    const client = mqtt_1.default.connect(MQTT_BROKER_URL, options);
    client.on("connect", () => {
        console.log("[MQTT] Connected to broker.");
        // Subscribe ke semua topik sensor di semua perangkat
        const sensorTopic = "warehouses/+/areas/+/devices/+/sensors/+";
        const statusTopic = "warehouses/+/areas/+/devices/+/status";
        client.subscribe([sensorTopic, statusTopic], (err) => {
            // <-- SUBSCRIBE KEDUA TOPIK
            if (!err) {
                console.log(`[MQTT] Subscribed to sensor and status topics.`);
            }
        });
    });
    client.on("message", async (topic, payload) => {
        const topicParts = topic.split("/");
        const message = payload.toString();
        const deviceId = topicParts[5];
        // Cek apakah ini pesan status/heartbeat
        if (topicParts.length === 7 && topicParts[6] === "status") {
            await (0, deviceService_1.updateDeviceHeartbeat)(deviceId);
            return; // Selesai proses
        }
        // Cek apakah ini pesan sensor
        if (topicParts.length === 8 && topicParts[6] === "sensors") {
            // warehouses/[1]/areas/[3]/devices/[5]/sensors/[7]
            if (topicParts.length !== 8 || topicParts[6] !== "sensors")
                return;
            const deviceId = topicParts[5];
            const systemType = topicParts[7];
            try {
                const data = JSON.parse(message);
                if (systemType === "lingkungan") {
                    await logService.ingestLingkunganLog({
                        device_id: deviceId,
                        payload: data,
                        temperature: data.temp,
                        humidity: data.humidity,
                    });
                    // Panggil service alerting setelah data disimpan
                    await alertingService.processSensorDataForAlerts(deviceId, systemType, data); // <-- PANGGIL
                }
                // Tambahkan blok 'else if' untuk systemType lain di sini
            }
            catch (error) {
                console.error("[MQTT] Error processing message:", error);
            }
        }
    });
    client.on("error", (error) => {
        console.error("[MQTT] Connection error:", error);
    });
};
exports.initializeMqttClient = initializeMqttClient;
