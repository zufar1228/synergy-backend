// backend/src/services/actuationService.ts
import { client as mqttClient } from '../mqtt/client'; // <-- Impor client MQTT yang sudah diekspor
import { Device, Area } from '../db/models';
import ApiError from '../utils/apiError';

// Definisikan tipe untuk hasil query dengan relasi
interface DeviceWithArea extends Device {
  area: Area;
}

// ============================================================================
// INTRUSI (Door Security System) Commands — Spec v18
// ============================================================================

export type IntrusiCommand =
  | { cmd: 'ARM' }
  | { cmd: 'DISARM' }
  | { cmd: 'CALIB_START' }
  | { cmd: 'CALIB_KNOCK_START'; n_hits?: number; timeout_ms?: number }
  | { cmd: 'SIREN_SILENCE'; issued_by?: string }
  | { cmd: 'STATUS' };

/**
 * Mengirim perintah ke perangkat intrusi (door security) via MQTT.
 * @param deviceId UUID perangkat
 * @param command Objek perintah sesuai spec v18
 */
export const sendIntrusiCommand = async (
  deviceId: string,
  command: IntrusiCommand
) => {
  console.log(
    `[Actuation] 🔒 sendIntrusiCommand CALLED: deviceId=${deviceId}, cmd=${command.cmd}`
  );

  // 1. Ambil detail perangkat + relasi area
  const device = (await Device.findByPk(deviceId, {
    include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
  })) as DeviceWithArea | null;

  if (!device) {
    throw new ApiError(404, 'Perangkat tidak ditemukan.');
  }
  if (device.system_type !== 'intrusi') {
    throw new ApiError(
      400,
      'Perintah ini hanya untuk perangkat intrusi (door security).'
    );
  }

  // 2. Bangun topik MQTT
  const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
  const payload = JSON.stringify(command);

  // 3. Publish perintah ke broker MQTT
  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(
        `[Actuation] Gagal mengirim perintah intrusi ke ${topic}:`,
        err
      );
    } else {
      console.log(
        `[Actuation] Perintah intrusi '${payload}' terkirim ke ${topic}`
      );
    }
  });
};
