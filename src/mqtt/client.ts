// backend/src/mqtt/client.ts
import mqtt from "mqtt";
import * as logService from "../services/logService";
import { updateDeviceHeartbeat } from "../services/deviceService";
import * as alertingService from "../services/alertingService";

// Gunakan broker publik HiveMQ untuk development.
// PENTING: Jangan gunakan ini untuk produksi karena tidak aman.
const MQTT_BROKER_URL = `mqtts://${process.env.MQTT_HOST}:8883`;
const options: mqtt.IClientOptions = {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
};

export const initializeMqttClient = () => {
  const client = mqtt.connect(MQTT_BROKER_URL, options);

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
      await updateDeviceHeartbeat(deviceId);
      return; // Selesai proses
    }

    // Cek apakah ini pesan sensor
    if (topicParts.length === 8 && topicParts[6] === "sensors") {
      // warehouses/[1]/areas/[3]/devices/[5]/sensors/[7]
      if (topicParts.length !== 8 || topicParts[6] !== "sensors") return;

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
          await alertingService.processSensorDataForAlerts(
            deviceId,
            systemType,
            data
          ); // <-- PANGGIL
        }
        // Tambahkan blok 'else if' untuk systemType lain di sini
      } catch (error) {
        console.error("[MQTT] Error processing message:", error);
      }
    }
  });

  client.on("error", (error) => {
    console.error("[MQTT] Connection error:", error);
  });
};
