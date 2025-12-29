// device-simulator/intrusi-simulator.ts
// Simulator untuk TinyML Intrusion Detection (ESP32-S3)
// 
// CATATAN: TinyML hanya mengirim data ketika INTRUSI terdeteksi!
// Normal dan Disturbance TIDAK dikirim (hemat bandwidth & baterai)
// 
// Jalankan dengan:
//   pnpm simulator:intrusi <warehouseId> <areaId> <deviceId> <mqttUsername> <mqttPassword>
//   pnpm simulator:intrusi <warehouseId> <areaId> <deviceId> <mqttUsername> <mqttPassword> --quick

import mqtt from "mqtt";
import dotenv from "dotenv";
dotenv.config();

// --- PARSE COMMAND LINE ARGUMENTS ---
const args = process.argv.slice(2);
const isQuickMode = args.includes("--quick") || args.includes("-q");
const filteredArgs = args.filter(a => !a.startsWith("-"));

// --- KONFIGURASI ---
// SEMUA parameter wajib dari command line atau environment variable
// Setiap device punya MQTT credentials sendiri (dibuat saat device di-register)
const WAREHOUSE_ID = "8d43ada2-4958-4345-a9fe-4e967da0526a";
const AREA_ID = "b0bc8d76-31d2-495b-88b8-c4e06839f956";
const DEVICE_ID = "cf29d935-fe62-4f76-b133-37c2da06f249";
const DEVICE_MQTT_USERNAME = "device-cf29d935-fe62-4f76-b133-37c2da06f249";
const DEVICE_MQTT_PASSWORD = "pwd-cf29d935-fe62-4f76-b133-37c2da06f249-1766187885413";

const MQTT_HOST = process.env.MQTT_HOST || "mfe19520.ala.asia-southeast1.emqxsl.com";
const MQTT_PORT = 8883; // SSL

const TOPIC_DATA = `warehouses/${WAREHOUSE_ID}/areas/${AREA_ID}/devices/${DEVICE_ID}/sensors/intrusi`;
const TOPIC_STATUS = `warehouses/${WAREHOUSE_ID}/areas/${AREA_ID}/devices/${DEVICE_ID}/status`;

console.log("=".repeat(60));
console.log("🛡️  TinyML INTRUSION DETECTION SIMULATOR");
console.log("=".repeat(60));
console.log("📋 Configuration:");
console.log(`   Mode: ${isQuickMode ? "Quick Test (3 intrusions)" : "Continuous"}`);
console.log(`   MQTT Host: ${MQTT_HOST}`);
console.log(`   Device ID: ${DEVICE_ID}`);
console.log(`   Warehouse ID: ${WAREHOUSE_ID}`);
console.log(`   Area ID: ${AREA_ID}`);
console.log(`   MQTT Username: ${DEVICE_MQTT_USERNAME}`);
console.log(`   MQTT Password: ${DEVICE_MQTT_PASSWORD ? "***" + DEVICE_MQTT_PASSWORD.slice(-8) : "(not set)"}`);
console.log(`   Data Topic: ${TOPIC_DATA}`);
console.log(`   Status Topic: ${TOPIC_STATUS}`);
console.log("=".repeat(60));
console.log("\n💡 NOTE: TinyML only sends data when INTRUSION is detected!");
console.log("   (Normal & Disturbance are processed locally, not sent)");
console.log("=".repeat(60));

// Validasi konfigurasi
if (!WAREHOUSE_ID || !AREA_ID || !DEVICE_ID || !DEVICE_MQTT_USERNAME || !DEVICE_MQTT_PASSWORD) {
  console.error("\n❌ ERROR: Missing required parameters!");
  console.log("\n📖 Usage:");
  console.log("   pnpm simulator:intrusi <warehouseId> <areaId> <deviceId> <mqttUsername> <mqttPassword> [--quick]");
  console.log("\n📝 Example:");
  console.log("   pnpm simulator:intrusi abc123 def456 ghi789 device-ghi789 pwd-ghi789-1234567890");
  console.log("\n💡 How to get these values:");
  console.log("   1. Create a device with type 'intrusi' in the web app");
  console.log("   2. Copy the MQTT credentials shown after device creation");
  console.log("      - mqtt_username: device-{deviceId}");
  console.log("      - mqtt_password: pwd-{deviceId}-{timestamp}");
  console.log("   3. Get warehouseId and areaId from Supabase dashboard");
  console.log("\n🔧 Or set environment variables:");
  console.log("   WAREHOUSE_ID, AREA_ID, INTRUSI_DEVICE_ID, DEVICE_MQTT_USERNAME, DEVICE_MQTT_PASSWORD");
  process.exit(1);
}

// Koneksi MQTT dengan kredensial DEVICE (bukan backend)
const client = mqtt.connect(`mqtts://${MQTT_HOST}:${MQTT_PORT}`, {
  username: DEVICE_MQTT_USERNAME,
  password: DEVICE_MQTT_PASSWORD,
  rejectUnauthorized: false,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
});

client.on("connect", () => {
  console.log(`\n✅ [TinyML Simulator] Connected to ${MQTT_HOST}`);
  console.log("   Starting simulation...\n");

  // 1. Kirim Heartbeat Awal (Online Status)
  sendHeartbeat();

  if (isQuickMode) {
    // Quick Test Mode - kirim 3 intrusi lalu exit
    runQuickTest();
  } else {
    // Continuous Mode
    setInterval(sendHeartbeat, 60000); // Tiap 1 menit
    simulateEvents();
  }
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
  // TinyML Edge Logic:
  // - Device terus-menerus memproses audio/sensor secara lokal
  // - HANYA mengirim data ke cloud jika INTRUSI terdeteksi
  // - Normal & Disturbance diproses lokal, tidak dikirim (hemat bandwidth)

  console.log("\n🎲 Simulation Mode (TinyML Edge Processing):");
  console.log("   Device memproses sensor secara lokal...");
  console.log("   Hanya INTRUSI yang dikirim ke cloud!");
  console.log("\n   Probabilitas per 5 detik:");
  console.log("   - 90% tidak ada intrusi (tidak kirim)");
  console.log("   - 10% INTRUSION detected (kirim ke cloud!)");
  console.log("\n📡 Waiting for intrusion events...\n");
  console.log("─".repeat(60));

  let intrusionCount = 0;

  setInterval(() => {
    const rand = Math.random();

    // 90% waktu tidak ada intrusi (TinyML memproses lokal, tidak kirim apa-apa)
    if (rand < 0.9) {
      // Simulating local processing - no data sent
      return;
    }

    // 10% INTRUSI terdeteksi - kirim ke cloud!
    intrusionCount++;
    const confidence = 0.85 + Math.random() * 0.14; // 0.85 - 0.99

    console.log("=".repeat(60));
    console.log(`🚨 [INTRUSION #${intrusionCount}] DETECTED!`);
    console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
    console.log("=".repeat(60));

    const payload = JSON.stringify({
      event: "Intrusion",
      conf: parseFloat(confidence.toFixed(4)),
      ts: new Date().toISOString(),
    });

    client.publish(TOPIC_DATA, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`❌ Publish error: ${err.message}`);
      } else {
        console.log(`📤 Sent to cloud: ${payload}`);
        console.log("   → Should trigger Telegram notification!");
        console.log("─".repeat(60) + "\n");
      }
    });
  }, 5000); // Check setiap 5 detik
}

// Quick Test Mode - kirim 3 intrusi untuk test Telegram
function runQuickTest() {
  console.log("\n⚡ QUICK TEST MODE");
  console.log("   Mengirim 3 INTRUSION events dalam 6 detik...");
  console.log("   (Setiap event akan trigger Telegram notification!)\n");
  console.log("─".repeat(60));

  // Sequence: 3 Intrusion events
  const eventSequence = [
    { conf: 0.88, delay: 0 },
    { conf: 0.92, delay: 2000 },
    { conf: 0.96, delay: 4000 },
  ];

  let eventsSent = 0;

  eventSequence.forEach((eventData, index) => {
    setTimeout(() => {
      const payload = JSON.stringify({
        event: "Intrusion",
        conf: eventData.conf,
        ts: new Date().toISOString(),
      });

      console.log("=".repeat(60));
      console.log(`🚨 [INTRUSION ${index + 1}/3] Confidence: ${(eventData.conf * 100).toFixed(1)}%`);
      console.log("=".repeat(60));

      client.publish(TOPIC_DATA, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error(`❌ Error: ${err.message}`);
        } else {
          console.log(`📤 Sent: ${payload}`);
          console.log("   → Telegram notification should be sent!");
          console.log("─".repeat(60));
        }

        eventsSent++;
        if (eventsSent >= eventSequence.length) {
          setTimeout(() => {
            console.log("\n" + "=".repeat(60));
            console.log("✅ QUICK TEST COMPLETE!");
            console.log("=".repeat(60));
            console.log(`   Total ${eventsSent} intrusion events sent`);
            console.log("\n📋 Verifikasi:");
            console.log("   1. ✅ Cek Telegram group untuk alert notification");
            console.log("   2. ✅ Cek Analytics page untuk event data");
            console.log("   3. ✅ Cek database (intrusi_logs table)");
            console.log("\n");
            client.end(true, () => process.exit(0));
          }, 1000);
        }
      });
    }, eventData.delay);
  });
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
