// backend/src/services/warehouseService.ts

import { Warehouse, Area, Device } from "../db/models";
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

type WarehouseCreationAttributes = WarehouseAttributes;

export const getWarehouseWithAreaSystems = async (warehouseId: string) => {
  const warehouse = await Warehouse.findByPk(warehouseId, {
    include: [
      {
        model: Area,
        as: "areas",
        attributes: ["id", "name"],
        include: [
          {
            model: Device,
            as: "devices",
            attributes: ["system_type"],
          },
        ],
      },
    ],
    order: [[{ model: Area, as: "areas" }, "name", "ASC"]],
  });

  if (!warehouse) {
    throw new ApiError(404, "Warehouse not found");
  }

  // 2. Gunakan type assertion 'as' untuk memberitahu TypeScript
  //    bahwa kita tahu struktur data yang benar.
  const warehouseData = warehouse.toJSON() as WarehouseWithAreas;

  // Sekarang TypeScript tahu bahwa warehouseData.areas adalah array AreaWithDevices
  const transformedAreas = warehouseData.areas.map((area) => {
    // <-- 'area' sekarang punya tipe yang benar
    const systemSummary: { [key: string]: number } = {};

    // Dan 'device' juga punya tipe yang benar
    area.devices.forEach((device) => {
      systemSummary[device.system_type] =
        (systemSummary[device.system_type] || 0) + 1;
    });

    const activeSystems = Object.keys(systemSummary).map((type) => ({
      system_type: type,
      device_count: systemSummary[type],
    }));

    return {
      id: area.id,
      name: area.name,
      active_systems: activeSystems,
    };
  });

  const response = {
    id: warehouseData.id,
    name: warehouseData.name,
    location: warehouseData.location,
    areas: transformedAreas,
  };

  return response;
};

export const getAllWarehouses = async () => {
  const warehouses = await Warehouse.findAll({
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
