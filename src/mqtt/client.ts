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
};

// --- PERBAIKAN UTAMA ---
// 1. Buat client di scope atas
const client = mqtt.connect(MQTT_BROKER_URL, options);

// 2. Ekspor client agar bisa digunakan oleh service lain (seperti ActuationService)
export { client };
// -----------------------

export const initializeMqttClient = () => {
  client.on("connect", () => {
    console.log("[MQTT] Terhubung ke broker.");
    const sensorTopic = "warehouses/+/areas/+/devices/+/sensors/+";
    const statusTopic = "warehouses/+/areas/+/devices/+/status";

    client.subscribe([sensorTopic, statusTopic], (err) => {
      if (!err) {
        console.log(`[MQTT] Berlangganan ke topik sensor dan status.`);
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
            co2_ppm: data.co2_ppm, // <-- TAMBAHKAN INI
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
    console.error("[MQTT] Error koneksi:", error);
  });
};
