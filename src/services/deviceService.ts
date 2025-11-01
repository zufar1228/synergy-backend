// backend/src/services/deviceService.ts

import { Device, Area, Warehouse } from "../db/models";
import { DeviceCreationAttributes } from "../db/models/device";
import { sequelize } from "../db/config";
import ApiError from "../utils/apiError";
import { UniqueConstraintError } from "sequelize";
import * as emqxService from "./emqxService";

// Definisikan tipe untuk hasil query dengan relasi
interface DeviceWithArea extends Device {
  area: Area;
}

// Ambil semua perangkat beserta relasi Area dan Gudang induknya
export const getAllDevices = async () => {
  return await Device.findAll({
    include: [
      {
        model: Area,
        as: "area",
        attributes: ["id", "name"],
        include: [
          {
            model: Warehouse,
            as: "warehouse",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
    order: [["name", "ASC"]],
  });
};

// Fungsi createDevice sudah ada dari langkah sebelumnya, kita biarkan
export const createDevice = async (deviceData: DeviceCreationAttributes) => {
  const transaction = await sequelize.transaction();
  try {
    const newDevice = await Device.create(deviceData, { transaction });
    let mqttCredentials = null; // Default kredensial adalah null

    // === PERUBAHAN DI SINI: Provisioning Bersyarat ===
    // Hanya jalankan provisioning MQTT jika BUKAN tipe keamanan
    if (deviceData.system_type !== "keamanan") {
      const deviceWithRelations = (await Device.findByPk(newDevice.id, {
        include: [{ model: Area, as: "area" }],
        transaction,
      })) as DeviceWithArea | null;
      if (!deviceWithRelations)
        throw new Error("Gagal mengambil relasi untuk perangkat baru");

      // Panggil service EMQX
      mqttCredentials = await emqxService.provisionDeviceInEMQX(
        deviceWithRelations
      );
    }
    // ===============================================

    await transaction.commit();
    // Kembalikan kredensial (bisa jadi null jika tipe 'keamanan')
    return { device: newDevice, mqttCredentials };
  } catch (error: any) {
    await transaction.rollback();

    // === PERBAIKAN UTAMA DI SINI ===
    // Cek nama error secara spesifik
    if (error.name === "SequelizeUniqueConstraintError") {
      throw new ApiError(
        409,
        `Perangkat dengan tipe sistem '${deviceData.system_type}' sudah ada di area ini.`
      );
    }
    // =============================

    console.error("[Device Service] Failed to create device:", error);
    if (error instanceof ApiError) throw error;
    if (error.isAxiosError) {
      throw new ApiError(502, "Gagal membuat konfigurasi MQTT di provider.");
    }
    throw new ApiError(500, "Gagal membuat perangkat karena kesalahan server.");
  }
};

// Fungsi baru untuk update
export const updateDevice = async (
  id: string,
  data: Partial<DeviceCreationAttributes>
) => {
  const device = await Device.findByPk(id);
  if (!device) throw new ApiError(404, "Perangkat tidak ditemukan");

  // Mencegah perubahan system_type setelah dibuat
  if (data.system_type && data.system_type !== device.system_type) {
    throw new ApiError(
      400,
      "Tipe sistem (system_type) tidak dapat diubah setelah perangkat dibuat."
    );
  }

  try {
    await device.update(data);
    return device;
  } catch (error) {
    // PERBAIKAN: Gunakan UniqueConstraintError secara langsung
    if (error instanceof UniqueConstraintError) {
      throw new ApiError(
        409,
        `Perangkat dengan tipe sistem '${data.system_type}' sudah ada di area ini.`
      );
    }
    throw error;
  }
};

// Fungsi baru untuk delete
export const deleteDevice = async (id: string) => {
  const device = await Device.findByPk(id);
  if (!device) throw new ApiError(404, "Perangkat tidak ditemukan");

  // === PERUBAHAN DI SINI: De-provisioning Bersyarat ===
  // Hanya hapus user EMQX jika BUKAN tipe keamanan
  if (device.system_type !== "keamanan") {
    await emqxService.deprovisionDeviceInEMQX(id);
  }
  // =================================================

  // 2. Jika berhasil, baru hapus dari database kita
  await device.destroy();
};

// Fungsi baru untuk mengambil satu device by id
export const getDeviceById = async (id: string) => {
  const device = await Device.findByPk(id, {
    include: [{ model: Area, as: "area" }], // Sertakan area untuk konteks
  });
  if (!device) throw new ApiError(404, "Perangkat tidak ditemukan");
  return device;
};

// Fungsi updateHeartbeat tetap ada
export const updateDeviceHeartbeat = async (
  deviceId: string
): Promise<void> => {
  try {
    await Device.update(
      { status: "Online", last_heartbeat: new Date() },
      { where: { id: deviceId } }
    );
    console.log(`[Device Service] Heartbeat updated for device ${deviceId}`);
  } catch (error) {
    console.error(
      `[Device Service] Failed to update heartbeat for ${deviceId}:`,
      error
    );
  }
};
