// backend/src/services/actuationService.ts
import { client as mqttClient } from "../mqtt/client"; // <-- Impor client MQTT yang sudah diekspor
import { Device, Area } from "../db/models";
import { FanStatus } from "../db/models/device";
import ApiError from "../utils/apiError";

// Definisikan tipe untuk hasil query dengan relasi
interface DeviceWithArea extends Device {
  area: Area;
}

/**
 * Mengirim perintah On/Off ke perangkat dan memperbarui status di database.
 * @param deviceId UUID perangkat yang dituju
 * @param state Status baru ('On' atau 'Off')
 */
export const controlFanRelay = async (deviceId: string, state: FanStatus) => {
  // 1. Ambil detail perangkat (termasuk relasinya) untuk membangun topik
  const device = (await Device.findByPk(deviceId, {
    include: [{ model: Area, as: "area", attributes: ["id", "warehouse_id"] }],
  })) as DeviceWithArea | null;

  if (!device) {
    throw new ApiError(404, "Perangkat tidak ditemukan.");
  }
  if (device.system_type !== "lingkungan") {
    throw new ApiError(400, "Perintah ini hanya untuk perangkat lingkungan.");
  }

  // 2. Cegah pengiriman perintah yang tidak perlu
  if (device.fan_status === state) {
    console.log(
      `[Actuation] Kipas untuk ${deviceId} sudah dalam status '${state}'. Perintah diabaikan.`
    );
    return;
  }

  // 3. Bangun topik dan payload
  const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
  const payload = JSON.stringify({ relay: state });

  // 4. Kirim (publish) perintah ke broker MQTT
  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[Actuation] Gagal mengirim perintah ke ${topic}:`, err);
    } else {
      console.log(`[Actuation] Perintah '${payload}' terkirim ke ${topic}`);
    }
  });

  // 5. Update status di database kita agar sinkron
  await device.update({ fan_status: state });
  console.log(
    `[DB] Status kipas untuk ${deviceId} diperbarui menjadi '${state}'.`
  );
};
