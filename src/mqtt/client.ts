// backend/src/mqtt/client.ts
import mqtt from "mqtt";
import * as logService from "../services/logService";
import { updateDeviceHeartbeat } from "../services/deviceService";
import * as alertingService from "../services/alertingService";

// Ambil kredensial dari environment variables
const MQTT_BROKER_URL = `mqtts://${process.env.MQTT_HOST}:8883`;
const options: mqtt.IClientOptions = {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clean: true,
  reconnectPeriod: 5000,
};

console.log("=".repeat(80));
console.log("🚀 BACKEND MQTT CLIENT INITIALIZING");
console.log("=".repeat(80));
console.log("📡 Broker:", MQTT_BROKER_URL);
console.log("👤 Username:", process.env.MQTT_USERNAME);
console.log(
  "🔑 Password:",
  process.env.MQTT_PASSWORD?.substring(0, 20) + "..."
);
console.log("=".repeat(80));

// Buat client di scope atas
const client = mqtt.connect(MQTT_BROKER_URL, options);

// Ekspor client agar bisa digunakan oleh service lain
export { client };

export const initializeMqttClient = () => {
  client.on("connect", () => {
    console.log("\n✅ [MQTT] Backend connected to broker");

    // Subscribe ke topic sensor dan status
    const sensorTopic = "warehouses/+/areas/+/devices/+/sensors/#";
    const statusTopic = "warehouses/+/areas/+/devices/+/status";

    console.log(`📥 [MQTT] Subscribing to topics:`);
    console.log(`   - ${sensorTopic}`);
    console.log(`   - ${statusTopic}`);

    client.subscribe([sensorTopic, statusTopic], { qos: 1 }, (err, granted) => {
      if (!err) {
        console.log("✅ [MQTT] Successfully subscribed to topics");
        console.log("   Granted:", granted);
        console.log("\n⏳ [MQTT] Waiting for messages...\n");
      } else {
        console.error("❌ [MQTT] Subscription error:", err);
      }
    });
  });

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
        console.log("=".repeat(80) + "\n");
        return;
      }

      // Format: warehouses/[0]/[1]/areas/[2]/[3]/devices/[4]/[5]/status atau sensors/[6]/[7]
      // Index:  0           1   2       3   4       5    6      7/status atau 7/sensors 8/type
      const deviceId = topicParts[5];

      console.log("🔍 Topic parts:", topicParts);
      console.log("🔍 Device ID:", deviceId);

      // Cek apakah ini pesan status/heartbeat
      // Format: warehouses/{id}/areas/{id}/devices/{id}/status (length = 7)
      if (topicParts.length === 7 && topicParts[6] === "status") {
        console.log("💓 Processing heartbeat message");
        await updateDeviceHeartbeat(deviceId);
        console.log("✅ Heartbeat processed successfully");
        console.log("=".repeat(80) + "\n");
        return;
      }

      // Cek apakah ini pesan sensor
      // Format: warehouses/{id}/areas/{id}/devices/{id}/sensors/{type} (length = 8)
      if (topicParts.length === 8 && topicParts[6] === "sensors") {
        const systemType = topicParts[7];
        console.log("📊 Processing sensor data");
        console.log("   System Type:", systemType);

        const data = JSON.parse(message);
        console.log("   Parsed Data:", JSON.stringify(data, null, 2));

        if (systemType === "lingkungan") {
          console.log("🌡️ Saving environment sensor data...");

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
      console.error("❌ [MQTT] Error processing message:", error);
      if (error instanceof Error) {
        console.error("   Error name:", error.name);
        console.error("   Error message:", error.message);
        console.error("   Error stack:", error.stack);
      }
      console.log("=".repeat(80) + "\n");
    }
  });

  client.on("error", (error) => {
    console.error("\n❌ [MQTT] Connection error:", error);
  });

  client.on("reconnect", () => {
    console.log("\n🔄 [MQTT] Reconnecting to broker...");
  });

  client.on("offline", () => {
    console.log("\n📴 [MQTT] Client is offline");
  });

  client.on("close", () => {
    console.log("\n🔌 [MQTT] Connection closed");
  });
};
