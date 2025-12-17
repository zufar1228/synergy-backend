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
const logService = __importStar(require("../services/logService"));
const deviceService_1 = require("../services/deviceService");
const alertingService = __importStar(require("../services/alertingService"));
const intrusiService = __importStar(require("../services/intrusiService")); // <-- Import intrusi service
const proteksiAsetService = __importStar(require("../services/proteksiAsetService")); // <-- Import proteksi aset service
console.log("\n" + "=".repeat(80));
console.log("🔧 MQTT CLIENT MODULE LOADED");
console.log("=".repeat(80));
// Ambil kredensial dari environment variables
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
// Validasi environment variables
console.log("📋 Checking MQTT environment variables:");
console.log("   MQTT_HOST:", MQTT_HOST ? "✅ SET" : "❌ MISSING");
console.log("   MQTT_USERNAME:", MQTT_USERNAME ? "✅ SET" : "❌ MISSING");
console.log("   MQTT_PASSWORD:", MQTT_PASSWORD ? "✅ SET" : "❌ MISSING");
if (!MQTT_HOST || !MQTT_USERNAME || !MQTT_PASSWORD) {
    console.error("\n❌ FATAL ERROR: Missing required MQTT environment variables!");
    throw new Error("Missing MQTT configuration");
}
const MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;
console.log("\n📡 MQTT Configuration:");
console.log("   Broker URL:", MQTT_BROKER_URL);
console.log("   Username:", MQTT_USERNAME);
console.log("   Password:", MQTT_PASSWORD.substring(0, 20) + "...");
console.log("=".repeat(80) + "\n");
// Deklarasi client di scope module tapi BELUM dibuat
let client;
const initializeMqttClient = () => {
    console.log("=".repeat(80));
    console.log("🚀 INITIALIZING MQTT CLIENT");
    console.log("=".repeat(80));
    try {
        // Buat MQTT client options
        const options = {
            username: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 30000,
            keepalive: 60,
        };
        console.log("🔄 Creating MQTT client and connecting to broker...");
        console.log("   Broker:", MQTT_BROKER_URL);
        // BUAT CLIENT DI SINI (di dalam fungsi init)
        exports.client = client = mqtt_1.default.connect(MQTT_BROKER_URL, options);
        console.log("✅ MQTT client created, registering event handlers...\n");
        // Event: Connect
        client.on("connect", (connack) => {
            console.log("\n" + "=".repeat(80));
            console.log("✅ [MQTT] SUCCESSFULLY CONNECTED TO BROKER");
            console.log("=".repeat(80));
            console.log("   Session Present:", connack.sessionPresent);
            console.log("   Return Code:", connack.returnCode);
            console.log("=".repeat(80));
            // Subscribe ke topic sensor dan status
            const sensorTopic = "warehouses/+/areas/+/devices/+/sensors/#";
            const statusTopic = "warehouses/+/areas/+/devices/+/status";
            console.log("\n📥 [MQTT] Subscribing to topics:");
            console.log("   1.", sensorTopic);
            console.log("   2.", statusTopic);
            client.subscribe([sensorTopic, statusTopic], { qos: 1 }, (err, granted) => {
                if (err) {
                    console.error("\n❌ [MQTT] Subscription error:", err);
                    console.error("   Error message:", err.message);
                }
                else {
                    console.log("\n✅ [MQTT] Successfully subscribed to topics");
                    console.log("   Granted subscriptions:");
                    granted?.forEach((g, i) => {
                        console.log(`   ${i + 1}. Topic: ${g.topic}, QoS: ${g.qos}`);
                    });
                    console.log("\n⏳ [MQTT] Waiting for messages...\n");
                }
            });
        });
        // Event: Message
        client.on("message", async (topic, payload) => {
            console.log("\n" + "=".repeat(80));
            console.log("📨 [MQTT] MESSAGE RECEIVED");
            console.log("=".repeat(80));
            console.log("📍 Topic:", topic);
            console.log("📦 Payload:", payload.toString());
            try {
                const topicParts = topic.split("/");
                const message = payload.toString();
                // Validasi format topic minimal
                if (topicParts.length < 7) {
                    console.error("❌ Invalid topic format (too short):", topic);
                    console.error("   Expected at least 7 parts, got:", topicParts.length);
                    console.log("=".repeat(80) + "\n");
                    return;
                }
                const deviceId = topicParts[5];
                console.log("🔍 Parsed information:");
                console.log("   Topic parts:", topicParts);
                console.log("   Device ID:", deviceId);
                // Cek apakah ini pesan status/heartbeat
                if (topicParts.length === 7 && topicParts[6] === "status") {
                    console.log("💓 Processing heartbeat message...");
                    await (0, deviceService_1.updateDeviceHeartbeat)(deviceId);
                    console.log("✅ Heartbeat processed successfully");
                    console.log("=".repeat(80) + "\n");
                    return;
                }
                // Cek apakah ini pesan sensor
                if (topicParts.length === 8 && topicParts[6] === "sensors") {
                    const systemType = topicParts[7];
                    console.log("📊 Processing sensor data");
                    console.log("   System Type:", systemType);
                    const data = JSON.parse(message);
                    console.log("   Parsed Data:", JSON.stringify(data, null, 2));
                    if (systemType === "lingkungan") {
                        console.log("🌡️  Saving environment sensor data...");
                        await logService.ingestLingkunganLog({
                            device_id: deviceId,
                            payload: data,
                            temperature: data.temp,
                            humidity: data.humidity,
                            co2_ppm: data.co2_ppm,
                        });
                        console.log("✅ Environment data saved to database");
                        // Panggil service alerting setelah data disimpan
                        console.log("🔔 Checking for alerts...");
                        await alertingService.processSensorDataForAlerts(deviceId, systemType, data);
                        console.log("✅ Alert processing completed");
                    }
                    else if (systemType === "intrusi") {
                        // === TinyML INTRUSION DETECTION ===
                        console.log("🛡️  Processing TinyML intrusion data...");
                        try {
                            // Payload dari ESP32: { "event": "Intrusion", "conf": 0.98, "ts": "..." }
                            // 1. Validate payload
                            const validatedPayload = intrusiService.validateTinyMLPayload(data);
                            if (!validatedPayload) {
                                console.error("❌ [TinyML] Invalid payload format, skipping");
                                console.log("=".repeat(80) + "\n");
                                return;
                            }
                            // 2. Simpan ke Database (Semua event disimpan untuk audit)
                            const savedLog = await intrusiService.saveIntrusiLog(deviceId, validatedPayload);
                            if (!savedLog) {
                                console.error("❌ [TinyML] Failed to save log");
                                console.log("=".repeat(80) + "\n");
                                return;
                            }
                            // 3. LOGIKA ALERTING (Hanya jika Intrusi)
                            if (validatedPayload.event === "Intrusion") {
                                console.log("🚨 [TinyML] INTRUSION DETECTED! Triggering alerts...");
                                const device = await intrusiService.getDeviceWithRelations(deviceId);
                                if (device) {
                                    // Gunakan alertingService untuk kirim notifikasi
                                    await alertingService.processIntrusiAlert(deviceId, device, validatedPayload);
                                    console.log("✅ [TinyML] Alert notifications sent");
                                }
                                else {
                                    console.error(`❌ [TinyML] Device ${deviceId} not found for alerting`);
                                }
                            }
                        }
                        catch (intrusiError) {
                            console.error("❌ [TinyML] Error processing intrusion data:", intrusiError);
                        }
                    }
                    else if (systemType === "proteksi_aset") {
                        // === PROTEKSI ASET SYSTEM (ML-based incident detection) ===
                        console.log("🛡️  Processing Proteksi Aset data...");
                        try {
                            // Data bisa berupa: vibration, thermal, atau water sensor
                            // Format: { type: "vibration"|"thermal"|"water", data: {...} }
                            const sensorType = data.type || "vibration";
                            // Validasi payload
                            const validation = proteksiAsetService.validateProteksiAsetPayload({
                                sensorId: deviceId,
                                type: sensorType,
                                data: data.data || data,
                            });
                            if (!validation.valid) {
                                console.error(`❌ [ProteksiAset] Invalid payload: ${validation.error}`);
                                console.log("=".repeat(80) + "\n");
                                return;
                            }
                            // Proses dengan ML API (untuk vibration) atau lokal (untuk thermal/water)
                            const rawData = {
                                sensorId: deviceId,
                                type: sensorType,
                                data: data.data || data,
                            };
                            const result = await proteksiAsetService.processSensorDataWithML(rawData);
                            console.log(`📊 [ProteksiAset] ML Result: ${result.incident_type} (confidence: ${result.confidence})`);
                            // Simpan log jika bukan NORMAL
                            if (result.shouldSave) {
                                const savedLog = await proteksiAsetService.createLog(deviceId, result.incident_type, result.confidence, rawData);
                                console.log(`✅ [ProteksiAset] Incident logged: ${savedLog.id} - ${result.incident_type}`);
                                // Trigger alerting untuk incident berbahaya
                                if (["IMPACT", "WATER_LEAK"].includes(result.incident_type)) {
                                    console.log("🚨 [ProteksiAset] DANGER DETECTED! Triggering alerts...");
                                    await alertingService.processProteksiAsetAlert(deviceId, result.incident_type, rawData);
                                }
                                else if (["VIBRATION", "THERMAL"].includes(result.incident_type)) {
                                    console.log("⚠️ [ProteksiAset] WARNING detected, logging only");
                                }
                            }
                            else {
                                console.log("✅ [ProteksiAset] Normal reading, no incident saved");
                            }
                        }
                        catch (proteksiError) {
                            console.error("❌ [ProteksiAset] Error processing data:", proteksiError);
                        }
                    }
                    else {
                        console.log(`⚠️  Unknown system type: ${systemType}`);
                    }
                    console.log("=".repeat(80) + "\n");
                    return;
                }
                // Jika tidak cocok dengan format yang diharapkan
                console.warn("⚠️  Unhandled topic format:", topic);
                console.log("=".repeat(80) + "\n");
            }
            catch (error) {
                console.error("❌ [MQTT] Error processing message:");
                if (error instanceof Error) {
                    console.error("   Error name:", error.name);
                    console.error("   Error message:", error.message);
                    console.error("   Stack trace:", error.stack);
                }
                else {
                    console.error("   Unknown error:", error);
                }
                console.log("=".repeat(80) + "\n");
            }
        });
        // Event: Error
        client.on("error", (error) => {
            console.error("\n" + "=".repeat(80));
            console.error("❌ [MQTT] CONNECTION ERROR");
            console.error("=".repeat(80));
            console.error("   Error type:", error.name);
            console.error("   Error message:", error.message);
            if (error.code) {
                console.error("   Error code:", error.code);
            }
            console.error("   Full error:", error);
            console.error("=".repeat(80) + "\n");
        });
        // Event: Reconnect
        client.on("reconnect", () => {
            console.log("\n🔄 [MQTT] Reconnecting to broker...");
        });
        // Event: Offline
        client.on("offline", () => {
            console.log("\n📴 [MQTT] Client is offline");
        });
        // Event: Close
        client.on("close", () => {
            console.log("\n🔌 [MQTT] Connection closed");
        });
        console.log("✅ Event handlers registered successfully");
        console.log("⏳ Connection attempt should start automatically...");
        console.log("=".repeat(80) + "\n");
    }
    catch (error) {
        console.error("\n" + "=".repeat(80));
        console.error("❌ FATAL ERROR DURING MQTT CLIENT INITIALIZATION");
        console.error("=".repeat(80));
        console.error(error);
        console.error("=".repeat(80) + "\n");
        throw error;
    }
};
exports.initializeMqttClient = initializeMqttClient;
