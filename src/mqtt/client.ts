// backend/src/mqtt/client.ts
import mqtt from "mqtt";
import * as logService from "../services/logService";
import { updateDeviceHeartbeat } from "../services/deviceService";
import * as alertingService from "../services/alertingService";

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
  console.error(
    "\n❌ FATAL ERROR: Missing required MQTT environment variables!"
  );
  console.error(
    "   Please check your .env file and ensure these variables are set:"
  );
  console.error("   - MQTT_HOST");
  console.error("   - MQTT_USERNAME");
  console.error("   - MQTT_PASSWORD");
  console.log("=".repeat(80) + "\n");
  throw new Error("Missing MQTT configuration");
}

const MQTT_BROKER_URL = `mqtts://${MQTT_HOST}:8883`;

console.log("\n📡 MQTT Configuration:");
console.log("   Broker URL:", MQTT_BROKER_URL);
console.log("   Username:", MQTT_USERNAME);
console.log("   Password:", MQTT_PASSWORD.substring(0, 20) + "...");
console.log("=".repeat(80) + "\n");

const options: mqtt.IClientOptions = {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clean: true,
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  keepalive: 60,
};

// Buat client di scope atas
console.log("🔄 Creating MQTT client instance...");
const client = mqtt.connect(MQTT_BROKER_URL, options);
console.log("✅ MQTT client instance created\n");

// Ekspor client agar bisa digunakan oleh service lain
export { client };

export const initializeMqttClient = () => {
  console.log("=".repeat(80));
  console.log("🚀 INITIALIZING MQTT CLIENT EVENT HANDLERS");
  console.log("=".repeat(80));

  try {
    // Event: Connecting
    client.on("connecting", () => {
      console.log("⏳ [MQTT] Attempting to connect to broker...");
    });

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

      client.subscribe(
        [sensorTopic, statusTopic],
        { qos: 1 },
        (err, granted) => {
          if (err) {
            console.error("\n❌ [MQTT] Subscription error:", err);
            console.error("   Error message:", err.message);
          } else {
            console.log("\n✅ [MQTT] Successfully subscribed to topics");
            console.log("   Granted subscriptions:");
            granted?.forEach((g, i) => {
              console.log(`   ${i + 1}. Topic: ${g.topic}, QoS: ${g.qos}`);
            });
            console.log("\n⏳ [MQTT] Waiting for messages...\n");
          }
        }
      );
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
          console.error(
            "   Expected at least 7 parts, got:",
            topicParts.length
          );
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
          await updateDeviceHeartbeat(deviceId);
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
            await alertingService.processSensorDataForAlerts(
              deviceId,
              systemType,
              data
            );
            console.log("✅ Alert processing completed");
          } else {
            console.log(`⚠️  Unknown system type: ${systemType}`);
          }

          console.log("=".repeat(80) + "\n");
          return;
        }

        // Jika tidak cocok dengan format yang diharapkan
        console.warn("⚠️  Unhandled topic format:", topic);
        console.log("=".repeat(80) + "\n");
      } catch (error) {
        console.error("❌ [MQTT] Error processing message:");
        if (error instanceof Error) {
          console.error("   Error name:", error.name);
          console.error("   Error message:", error.message);
          console.error("   Stack trace:", error.stack);
        } else {
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
      if ((error as any).code) {
        console.error("   Error code:", (error as any).code);
      }
      console.error("   Full error object:", JSON.stringify(error, null, 2));
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
    console.log("⏳ Waiting for connection to establish...");
    console.log("=".repeat(80) + "\n");
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ FATAL ERROR DURING MQTT CLIENT INITIALIZATION");
    console.error("=".repeat(80));
    console.error(error);
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};
