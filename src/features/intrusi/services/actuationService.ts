/**
 * @file actuationService.ts
 * @purpose Sends ARM/DISARM/SILENCE commands to intrusi devices via MQTT
 * @usedBy intrusiController
 * @deps mqtt/client, db/drizzle, schema (devices, areas), ApiError
 * @exports IntrusiCommand, sendIntrusiCommand
 * @sideEffects MQTT publish, DB read (device+area lookup)
 */

import { client as mqttClient } from '../../../mqtt/client';
import { db } from '../../../db/drizzle';
import { devices, areas } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import ApiError from '../../../utils/apiError';

// ============================================================================
// INTRUSI (Door Security System) Commands — Spec v18
// ============================================================================

export type IntrusiCommand =
  | { cmd: 'ARM' }
  | { cmd: 'DISARM' }
  | { cmd: 'SIREN_SILENCE'; issued_by?: string }
  | { cmd: 'STATUS' };

/**
 * Mengirim perintah ke perangkat intrusi (door security) via MQTT.
 */
export const sendIntrusiCommand = async (
  deviceId: string,
  command: IntrusiCommand
) => {
  console.log(
    `[Actuation] sendIntrusiCommand CALLED: deviceId=${deviceId}, cmd=${command.cmd}`
  );

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, deviceId),
    with: { area: { columns: { id: true, warehouse_id: true } } }
  });

  if (!device) {
    throw new ApiError(404, 'Perangkat tidak ditemukan.');
  }
  if (device.system_type !== 'intrusi') {
    throw new ApiError(
      400,
      'Perintah ini hanya untuk perangkat intrusi (door security).'
    );
  }

  const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
  const payload = JSON.stringify(command);

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error(`[Actuation] Gagal mengirim perintah intrusi ke ${topic}:`, err);
    } else {
      console.log(`[Actuation] Perintah intrusi '${payload}' terkirim ke ${topic}`);
    }
  });
};
