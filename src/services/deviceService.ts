import { db } from '../db/drizzle';
import { devices, areas } from '../db/schema';
import type { DeviceInsert } from '../db/schema';
import { eq, and, asc } from 'drizzle-orm';
import ApiError from '../utils/apiError';
import * as emqxService from './emqxService';

export const getAllDevices = async () => {
  return await db.query.devices.findMany({
    with: {
      area: {
        columns: { id: true, name: true },
        with: { warehouse: { columns: { id: true, name: true } } }
      }
    },
    orderBy: [asc(devices.name)]
  });
};

export const createDevice = async (deviceData: DeviceInsert) => {
  try {
    return await db.transaction(async (tx) => {
      const [newDevice] = await tx
        .insert(devices)
        .values(deviceData)
        .returning();
      let mqttCredentials = null;

      if (deviceData.system_type !== 'keamanan') {
        const deviceWithRelations = await tx.query.devices.findFirst({
          where: eq(devices.id, newDevice.id),
          with: { area: true }
        });
        if (!deviceWithRelations)
          throw new Error('Gagal mengambil relasi untuk perangkat baru');

        mqttCredentials = await emqxService.provisionDeviceInEMQX(
          deviceWithRelations as any
        );
      }

      return { device: newDevice, mqttCredentials };
    });
  } catch (error: any) {
    // PostgreSQL unique violation
    if (error.code === '23505') {
      throw new ApiError(
        409,
        `Perangkat dengan tipe sistem '${deviceData.system_type}' sudah ada di area ini.`
      );
    }
    console.error('[Device Service] Failed to create device:', error);
    if (error instanceof ApiError) throw error;
    if (error.isAxiosError) {
      throw new ApiError(502, 'Gagal membuat konfigurasi MQTT di provider.');
    }
    throw new ApiError(500, 'Gagal membuat perangkat karena kesalahan server.');
  }
};

export const updateDevice = async (id: string, data: Partial<DeviceInsert>) => {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id)
  });
  if (!device) throw new ApiError(404, 'Perangkat tidak ditemukan');

  if (data.system_type && data.system_type !== device.system_type) {
    throw new ApiError(
      400,
      'Tipe sistem (system_type) tidak dapat diubah setelah perangkat dibuat.'
    );
  }

  try {
    const [updated] = await db
      .update(devices)
      .set({ ...data, updated_at: new Date() })
      .where(eq(devices.id, id))
      .returning();
    return updated;
  } catch (error: any) {
    if (error.code === '23505') {
      throw new ApiError(
        409,
        `Perangkat dengan tipe sistem '${data.system_type}' sudah ada di area ini.`
      );
    }
    throw error;
  }
};

export const deleteDevice = async (id: string) => {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id)
  });
  if (!device) throw new ApiError(404, 'Perangkat tidak ditemukan');

  if (device.system_type !== 'keamanan') {
    await emqxService.deprovisionDeviceInEMQX(id);
  }

  await db.delete(devices).where(eq(devices.id, id));
};

export const getDeviceById = async (id: string) => {
  const device = await db.query.devices.findFirst({
    where: eq(devices.id, id),
    with: { area: true }
  });
  if (!device) throw new ApiError(404, 'Perangkat tidak ditemukan');
  return device;
};

export const getDeviceByAreaAndSystem = async (
  areaId: string,
  systemType: string
) => {
  const result = await db
    .select({
      id: devices.id,
      name: devices.name,
      status: devices.status,
      fan_state: devices.fan_state,
      door_state: devices.door_state,
      intrusi_system_state: devices.intrusi_system_state,
      siren_state: devices.siren_state,
      power_source: devices.power_source,
      vbat_voltage: devices.vbat_voltage,
      vbat_pct: devices.vbat_pct
    })
    .from(devices)
    .where(
      and(eq(devices.area_id, areaId), eq(devices.system_type, systemType))
    )
    .limit(1);

  if (result.length === 0) {
    throw new ApiError(
      404,
      'Perangkat tidak ditemukan untuk area dan tipe sistem ini.'
    );
  }
  return result[0];
};

export const updateDeviceHeartbeat = async (
  deviceId: string,
  extraFields?: {
    door_state?: string;
    intrusi_system_state?: string;
    siren_state?: string;
    power_source?: string;
    vbat_voltage?: number;
    vbat_pct?: number;
    last_temperature?: number;
    last_humidity?: number;
    last_co2?: number;
    fan_state?: string;
    dehumidifier_state?: string;
    control_mode?: string;
  }
): Promise<void> => {
  try {
    const updateData: Record<string, any> = {
      status: 'Online',
      last_heartbeat: new Date()
    };

    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        if (value !== undefined && value !== null) {
          updateData[key] = value;
        }
      }
    }

    await db.update(devices).set(updateData).where(eq(devices.id, deviceId));
    console.log(`[Device Service] Heartbeat updated for device ${deviceId}`);
  } catch (error) {
    console.error(
      `[Device Service] Failed to update heartbeat for ${deviceId}:`,
      error
    );
  }
};
