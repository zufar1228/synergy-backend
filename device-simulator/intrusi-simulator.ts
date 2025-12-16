// device-simulator/intrusi-simulator.ts
// Simulator untuk TinyML Intrusion Detection (ESP32-S3)
// Jalankan dengan: npx ts-node intrusi-simulator.ts

import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

// --- KONFIGURASI ---
// PENTING: Ganti nilai-nilai ini dengan UUID dari database Anda!
const DEVICE_ID = process.env.INTRUSI_DEVICE_ID || "GANTI_DENGAN_UUID_DEVICE_INTRUSI";
const WAREHOUSE_ID = process.env.WAREHOUSE_ID || "GANTI_DENGAN_WAREHOUSE_ID";
const AREA_ID = process.env.AREA_ID || "GANTI_DENGAN_AREA_ID";

const MQTT_HOST = process.env.MQTT_HOST || "broker.emqx.io";
const MQTT_PORT = 8883; // SSL
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const TOPIC_DATA = `warehouses/${WAREHOUSE_ID}/areas/${AREA_ID}/devices/${DEVICE_ID}/sensors/intrusi`;
const TOPIC_STATUS = `warehouses/${WAREHOUSE_ID}/areas/${AREA_ID}/devices/${DEVICE_ID}/status`;

console.log("=".repeat(60));
console.log("🛡️  TinyML INTRUSION DETECTION SIMULATOR");
console.log("=".repeat(60));
console.log("📋 Configuration:");
console.log(`   MQTT Host: ${MQTT_HOST}`);
console.log(`   Device ID: ${DEVICE_ID}`);
console.log(`   Warehouse ID: ${WAREHOUSE_ID}`);
console.log(`   Area ID: ${AREA_ID}`);
console.log(`   Data Topic: ${TOPIC_DATA}`);
console.log(`   Status Topic: ${TOPIC_STATUS}`);
console.log("=".repeat(60));

// Validasi konfigurasi
if (DEVICE_ID === "GANTI_DENGAN_UUID_DEVICE_INTRUSI") {
  console.error("\n❌ ERROR: Anda harus mengisi DEVICE_ID yang benar!");
  console.log("   Cara mendapatkan UUID:");
  console.log("   1. Tambahkan device baru di Web App dengan system_type: 'intrusi'");
  console.log("   2. Copy UUID device tersebut");
  console.log("   3. Set environment variable INTRUSI_DEVICE_ID atau edit file ini");
  process.exit(1);
}

// Koneksi MQTT
const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  rejectUnauthorized: false,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
});

client.on("connect", () => {
  console.log(`\n✅ [TinyML Simulator] Connected to ${MQTT_HOST}`);
  console.log("   Starting simulation...\n");

  // 1. Kirim Heartbeat Awal (Online Status)
  sendHeartbeat();
  setInterval(sendHeartbeat, 60000); // Tiap 1 menit

  // 2. Simulasi Event Random
  simulateEvents();
});

client.on("error", (error) => {
  console.error("❌ MQTT Connection Error:", error.message);
});

client.on("reconnect", () => {
  console.log("🔄 Reconnecting to MQTT broker...");
});

client.on("close", () => {
  console.log("🔌 Connection closed");
});

function sendHeartbeat() {
  const payload = JSON.stringify({
    status: "online",
    timestamp: new Date().toISOString(),
    type: "intrusi-tinyml",
  });
  client.publish(TOPIC_STATUS, payload);
  console.log(`💓 [Heartbeat] Status online sent`);
}

function simulateEvents() {
  // Fungsi ini mensimulasikan logic AI di Edge
  // AI hanya mengirim data JIKA terdeteksi sesuatu (bukan data mentah terus-menerus)

  console.log("\n🎲 Simulation Mode:");
  console.log("   70% - Diam (tidak kirim, hemat bandwidth)");
  console.log("   20% - Disturbance (getaran/suara mencurigakan)");
  console.log("   10% - INTRUSION (percobaan penyusupan!)");
  console.log("\n📡 Waiting for events...\n");

  setInterval(() => {
    const rand = Math.random();

    let eventClass = "";
    let confidence = 0.0;

    if (rand < 0.7) {
      // 70% waktu diam (tidak kirim apa-apa, hemat baterai/bandwidth)
      // Ini adalah kelebihan TinyML - hanya kirim hasil inferensi, bukan raw data
      return;
    } else if (rand < 0.9) {
      // 20% Disturbance (Suara motor lewat / petir / getaran kecil)
      eventClass = "Disturbance";
      confidence = 0.6 + Math.random() * 0.2; // 0.6 - 0.8
      console.log(`⚠️  [Event] Disturbance detected (${(confidence * 100).toFixed(1)}%)`);
    } else {
      // 10% INTRUSI (Bahaya!)
      eventClass = "Intrusion";
      confidence = 0.85 + Math.random() * 0.14; // 0.85 - 0.99
      console.log("=".repeat(60));
      console.log(`🚨 [ALERT] INTRUSION DETECTED! (${(confidence * 100).toFixed(1)}%)`);
      console.log("=".repeat(60));
    }

    const payload = JSON.stringify({
      event: eventClass,
      conf: parseFloat(confidence.toFixed(4)),
      ts: new Date().toISOString(),
    });

    client.publish(TOPIC_DATA, payload);
    console.log(`📤 Published: ${payload}`);
  }, 5000); // Cek setiap 5 detik
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down simulator...");
  client.end(true, () => {
    console.log("✅ MQTT client disconnected");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n\n🛑 Shutting down simulator...");
  client.end(true, () => {
    console.log("✅ MQTT client disconnected");
    process.exit(0);
  });
});
