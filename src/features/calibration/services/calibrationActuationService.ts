/**
 * @file calibrationActuationService.ts
 * @purpose Sends calibration commands to devices via MQTT
 * @usedBy calibrationController
 * @deps mqtt/client, db/drizzle, schema (devices, areas)
 * @exports CalibrationCommand, sendCalibrationCommand
 * @sideEffects MQTT publish, DB read (device lookup)
 */

import { client as mqttClient } from '../../../mqtt/client';
import { db } from '../../../db/drizzle';
import { devices, areas } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export type CalibrationCommand =
  | { cmd: 'SET_SESSION'; session: string; trial: number; note?: string }
  | { cmd: 'START' }
  | { cmd: 'STOP' }
  | { cmd: 'MARK'; label: string }
  | { cmd: 'RECAL' };

/**
 * Send a calibration command to a device via MQTT
 */
export const sendCalibrationCommand = async (
  deviceId: string,
  command: CalibrationCommand
) => {
  console.log(
    `[Calibration] sendCalibrationCommand: deviceId=${deviceId}, cmd=${command.cmd}`
  );

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, deviceId),
    with: { area: { columns: { id: true, warehouse_id: true } } }
  });

  if (!device) {
    throw new Error('Device not found');
  }

  const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
  const payload = JSON.stringify(command);

  return new Promise<void>((resolve, reject) => {
    mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[Calibration] Failed to publish to ${topic}:`, err);
        reject(err);
      } else {
        console.log(`[Calibration] Command '${command.cmd}' sent to ${topic}`);
        resolve();
      }
    });
  });
};
