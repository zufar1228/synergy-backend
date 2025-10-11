// backend/src/services/warehouseService.ts

import { Warehouse, Area, Device } from "../db/models";
import { sequelize } from "../db/config";
import { WarehouseAttributes } from "../db/models/warehouse"; // Pastikan Anda mengimpor ini
import ApiError from "../utils/apiError";

// === PERBAIKAN DIMULAI DI SINI ===

// 1. Definisikan tipe-tipe data yang merepresentasikan hasil query kita secara akurat.
interface DeviceSummary {
  system_type: string;
}

interface AreaWithDevices {
  id: string;
  name: string;
  devices: DeviceSummary[];
}

interface WarehouseWithAreas extends WarehouseAttributes {
  areas: AreaWithDevices[];
}

interface WarehouseWithRelations extends Warehouse {
  areas: (Area & {
    devices: Device[];
  })[];
}

type WarehouseCreationAttributes = WarehouseAttributes;

export const getWarehouseWithAreaSystems = async (warehouseId: string) => {
  const warehouse = (await Warehouse.findByPk(warehouseId, {
    include: [
      {
        model: Area,
        as: "areas",
        attributes: ["id", "name"],
        include: [
          {
            model: Device,
            as: "devices",
            // === PERUBAHAN DI SINI: Ambil juga statusnya ===
            attributes: ["system_type", "status"],
          },
        ],
      },
    ],
    order: [[{ model: Area, as: "areas" }, "name", "ASC"]],
  })) as WarehouseWithRelations | null;

  if (!warehouse) {
    throw new ApiError(404, "Warehouse not found");
  }

  // === PERBAIKAN: Ganti query statistik yang kompleks dengan yang lebih sederhana ===
  const commonWhere = {
    include: [
      {
        model: Area,
        as: "area",
        attributes: [],
        where: { warehouse_id: warehouseId },
      },
    ],
  };

  // 1. Hitung total perangkat di gudang ini
  const totalDeviceCount = await Device.count(commonWhere);

  // 2. Hitung perangkat yang online di gudang ini
  const onlineDeviceCount = await Device.count({
    ...commonWhere,
    where: { status: "Online" },
  });
  // ======================================================================

  const warehouseData = warehouse.toJSON() as WarehouseWithAreas;

  // === PERUBAHAN DI SINI: Proses data status ===
  const transformedAreas = warehouseData.areas.map((area: any) => {
    const systemsMap = new Map<
      string,
      { device_count: number; status: string }
    >();

    area.devices.forEach((device: any) => {
      // Asumsi 1 tipe sistem per area, statusnya langsung diambil
      systemsMap.set(device.system_type, {
        device_count: 1,
        status: device.status,
      });
    });

    const activeSystems = Array.from(systemsMap.entries()).map(
      ([type, data]) => ({
        system_type: type,
        device_count: data.device_count,
        status: data.status, // <-- Kirim status ke frontend
      })
    );

    return { id: area.id, name: area.name, active_systems: activeSystems };
  });

  const response = {
    id: warehouseData.id,
    name: warehouseData.name,
    location: warehouseData.location,
    areaCount: warehouseData.areas.length,
    deviceCount: totalDeviceCount,
    onlineDeviceCount: onlineDeviceCount,
    areas: transformedAreas,
  };

  return response;
};

export const getAllWarehousesWithStats = async () => {
  const warehouses = await Warehouse.findAll({
    attributes: {
      include: [
        // Subquery untuk menghitung jumlah area
        [
          sequelize.literal(
            '(SELECT COUNT(*) FROM areas WHERE areas.warehouse_id = "Warehouse"."id")'
          ),
          "areaCount",
        ],
        // Subquery untuk menghitung jumlah total perangkat
        [
          sequelize.literal(`(
            SELECT COUNT(*) FROM devices 
            JOIN areas ON devices.area_id = areas.id 
            WHERE areas.warehouse_id = "Warehouse"."id"
          )`),
          "deviceCount",
        ],
        // Subquery untuk menghitung jumlah perangkat yang online
        [
          sequelize.literal(`(
            SELECT COUNT(*) FROM devices 
            JOIN areas ON devices.area_id = areas.id 
            WHERE areas.warehouse_id = "Warehouse"."id" AND devices.status = 'Online'
          )`),
          "onlineDeviceCount",
        ],
      ],
    },
    order: [["name", "ASC"]],
  });
  return warehouses;
};

export const createWarehouse = async (data: WarehouseCreationAttributes) => {
  const warehouse = await Warehouse.create(data);
  return warehouse;
};

export const updateWarehouse = async (
  id: string,
  data: Partial<WarehouseCreationAttributes>
) => {
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) throw new ApiError(404, "Warehouse not found");
  await warehouse.update(data);
  return warehouse;
};

export const deleteWarehouse = async (id: string) => {
  const warehouse = await Warehouse.findByPk(id);
  if (!warehouse) throw new ApiError(404, "Warehouse not found");
  await warehouse.destroy();
};
