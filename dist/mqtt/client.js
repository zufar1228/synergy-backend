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
const intrusiService = __importStar(require("../services/intrusiService"));
const lingkunganService = __importStar(require("../services/lingkunganService"));
const deviceService_1 = require("../services/deviceService");
const alertingService = __importStar(require("../services/alertingService"));
console.log('\n' + '='.repeat(80));
console.log('🔧 MQTT CLIENT MODULE LOADED');
console.log('='.repeat(80));
// Ambil kredensial dari environment variables
const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;
// Validasi environment variables
console.log('📋 Checking MQTT environment variables:');
console.log('   MQTT_HOST:', MQTT_HOST ? '✅ SET' : '❌ MISSING');
console.log('   MQTT_USERNAME:', MQTT_USERNAME ? '✅ SET' : '❌ MISSING');
console.log('   MQTT_PASSWORD:', MQTT_PASSWORD ? '✅ SET' : '❌ MISSING');
if (!MQTT_HOST || !MQTT_USERNAME || !MQTT_PASSWORD) {
    console.error('\n❌ FATAL ERROR: Missing required MQTT environment variables!');
    throw new Error('Missing MQTT configuration');
}
const MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;
console.log('\n📡 MQTT Configuration:');
console.log('   Broker URL:', MQTT_BROKER_URL);
console.log('   Username:', MQTT_USERNAME);
console.log('   Password:', MQTT_PASSWORD.substring(0, 20) + '...');
console.log('='.repeat(80) + '\n');
// Deklarasi client di scope module tapi BELUM dibuat
let client;
const initializeMqttClient = () => {
    console.log('='.repeat(80));
    console.log('🚀 INITIALIZING MQTT CLIENT');
    console.log('='.repeat(80));
    try {
        // Buat MQTT client options
        const options = {
            username: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 30000,
            keepalive: 60
        };
        console.log('🔄 Creating MQTT client and connecting to broker...');
        console.log('   Broker:', MQTT_BROKER_URL);
        // BUAT CLIENT DI SINI (di dalam fungsi init)
        exports.client = client = mqtt_1.default.connect(MQTT_BROKER_URL, options);
        console.log('✅ MQTT client created, registering event handlers...\n');
        // Event: Connect
        client.on('connect', (connack) => {
            console.log('\n' + '='.repeat(80));
            console.log('✅ [MQTT] SUCCESSFULLY CONNECTED TO BROKER');
            console.log('='.repeat(80));
            console.log('   Session Present:', connack.sessionPresent);
            console.log('   Return Code:', connack.returnCode);
            console.log('='.repeat(80));
            // Subscribe ke topic sensor dan status
            const sensorTopic = 'warehouses/+/areas/+/devices/+/sensors/#';
            const statusTopic = 'warehouses/+/areas/+/devices/+/status';
            const mlResponseTopic = 'synergy/ml/predict/response/+';
            const mlStatusTopic = 'synergy/ml/status';
            console.log('\n📥 [MQTT] Subscribing to topics:');
            console.log('   1.', sensorTopic);
            console.log('   2.', statusTopic);
            console.log('   3.', mlResponseTopic);
            console.log('   4.', mlStatusTopic);
            client.subscribe([sensorTopic, statusTopic, mlResponseTopic, mlStatusTopic], { qos: 1 }, (err, granted) => {
                if (err) {
                    console.error('\n❌ [MQTT] Subscription error:', err);
                    console.error('   Error message:', err.message);
                }
                else {
                    console.log('\n✅ [MQTT] Successfully subscribed to topics');
                    console.log('   Granted subscriptions:');
                    granted?.forEach((g, i) => {
                        console.log(`   ${i + 1}. Topic: ${g.topic}, QoS: ${g.qos}`);
                    });
                    console.log('\n⏳ [MQTT] Waiting for messages...\n');
                }
            });
        });
        // Event: Message
        client.on('message', async (topic, payload) => {
            console.log('\n' + '='.repeat(80));
            console.log('📨 [MQTT] MESSAGE RECEIVED');
            console.log('='.repeat(80));
            console.log('📍 Topic:', topic);
            console.log('📦 Payload:', payload.toString());
            try {
                const topicParts = topic.split('/');
                const message = payload.toString();
                // ============================================================
                // Handle ML prediction responses: synergy/ml/predict/response/{deviceId}
                // ============================================================
                if (topic.startsWith('synergy/ml/predict/response/')) {
                    const deviceId = topicParts[4]; // synergy/ml/predict/response/{deviceId}
                    console.log('🧠 Processing ML prediction response for device:', deviceId);
                    try {
                        const prediction = JSON.parse(message);
                        await lingkunganService.handlePredictionResult(deviceId, prediction);
                        console.log('✅ ML prediction result processed successfully');
                    }
                    catch (parseErr) {
                        console.error('❌ Failed to parse ML prediction response:', parseErr);
                    }
                    console.log('='.repeat(80) + '\n');
                    return;
                }
                // ============================================================
                // Handle ML server status: synergy/ml/status
                // ============================================================
                if (topic === 'synergy/ml/status') {
                    try {
                        const status = JSON.parse(message);
                        console.log(`🤖 ML Server status: ${status.status} (model: ${status.model_loaded ? '✅' : '❌'}, scaler: ${status.scaler_loaded ? '✅' : '❌'})`);
                    }
                    catch {
                        console.log('🤖 ML Server status:', message);
                    }
                    console.log('='.repeat(80) + '\n');
                    return;
                }
                // ============================================================
                // Handle device topics (sensor data, heartbeats)
                // ============================================================
                // Validasi format topic minimal
                if (topicParts.length < 7) {
                    console.error('❌ Invalid topic format (too short):', topic);
                    console.error('   Expected at least 7 parts, got:', topicParts.length);
                    console.log('='.repeat(80) + '\n');
                    return;
                }
                const deviceId = topicParts[5];
                console.log('🔍 Parsed information:');
                console.log('   Topic parts:', topicParts);
                console.log('   Device ID:', deviceId);
                // Cek apakah ini pesan status/heartbeat
                if (topicParts.length === 7 && topicParts[6] === 'status') {
                    console.log('💓 Processing heartbeat message...');
                    // Parse status payload for intrusi-specific fields
                    let extraFields;
                    try {
                        const statusData = JSON.parse(message);
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
                            console.log('🚪 Intrusi status fields:', extraFields);
                        }
                        // Process power/battery alerts
                        if (statusData.power || statusData.vbat_pct !== undefined) {
                            try {
                                await alertingService.processPowerAlert(deviceId, {
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
                                console.error('⚠️ Power alert processing error:', alertErr);
                            }
                        }
                    }
                    catch {
                        // Non-JSON heartbeat — that's fine, just update heartbeat
                    }
                    await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, extraFields);
                    console.log('✅ Heartbeat processed successfully');
                    console.log('='.repeat(80) + '\n');
                    return;
                }
                // Cek apakah ini pesan sensor
                if (topicParts.length === 8 && topicParts[6] === 'sensors') {
                    const systemType = topicParts[7];
                    console.log('📊 Processing sensor data');
                    console.log('   System Type:', systemType);
                    const data = JSON.parse(message);
                    console.log('   Parsed Data:', JSON.stringify(data, null, 2));
                    if (systemType === 'intrusi') {
                        console.log('🚪 Processing door security event...');
                        // Update heartbeat + device state fields
                        // Derive siren_state from event type so UI updates immediately
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
                        console.log('✅ Door security event saved to database');
                        // Process alerts for alarm events
                        const alarmEvents = ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'];
                        if (alarmEvents.includes(data.type)) {
                            console.log('🔔 Alarm event detected, processing alerts...');
                            await alertingService.processIntrusiAlert(deviceId, data);
                            console.log('✅ Intrusi alert processing completed');
                        }
                    }
                    else if (systemType === 'lingkungan') {
                        console.log('🌡️ Processing environmental sensor data...');
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
                        console.log('✅ Environmental sensor data saved and prediction triggered');
                    }
                    else {
                        console.log(`⚠️  Unknown system type: ${systemType}`);
                    }
                    console.log('='.repeat(80) + '\n');
                    return;
                }
                // Jika tidak cocok dengan format yang diharapkan
                console.warn('⚠️  Unhandled topic format:', topic);
                console.log('='.repeat(80) + '\n');
            }
            catch (error) {
                console.error('❌ [MQTT] Error processing message:');
                if (error instanceof Error) {
                    console.error('   Error name:', error.name);
                    console.error('   Error message:', error.message);
                    console.error('   Stack trace:', error.stack);
                }
                else {
                    console.error('   Unknown error:', error);
                }
                console.log('='.repeat(80) + '\n');
            }
        });
        // Event: Error
        client.on('error', (error) => {
            console.error('\n' + '='.repeat(80));
            console.error('❌ [MQTT] CONNECTION ERROR');
            console.error('='.repeat(80));
            console.error('   Error type:', error.name);
            console.error('   Error message:', error.message);
            if (error.code) {
                console.error('   Error code:', error.code);
            }
            console.error('   Full error:', error);
            console.error('='.repeat(80) + '\n');
        });
        // Event: Reconnect
        client.on('reconnect', () => {
            console.log('\n🔄 [MQTT] Reconnecting to broker...');
        });
        // Event: Offline
        client.on('offline', () => {
            console.log('\n📴 [MQTT] Client is offline');
        });
        // Event: Close
        client.on('close', () => {
            console.log('\n🔌 [MQTT] Connection closed');
        });
        console.log('✅ Event handlers registered successfully');
        console.log('⏳ Connection attempt should start automatically...');
        console.log('='.repeat(80) + '\n');
    }
    catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ FATAL ERROR DURING MQTT CLIENT INITIALIZATION');
        console.error('='.repeat(80));
        console.error(error);
        console.error('='.repeat(80) + '\n');
        throw error;
    }
};
exports.initializeMqttClient = initializeMqttClient;
