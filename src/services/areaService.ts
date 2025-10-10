// backend/src/services/areaService.ts
import { Area, Warehouse } from "../db/models";
import ApiError from "../utils/apiError";

interface AreaCreationAttributes {
  name: string;
  warehouse_id: string;
}

export const getAllAreas = async () => {
  // Kita 'include' Warehouse untuk bisa menampilkan nama gudang induknya di UI
  const areas = await Area.findAll({
    include: [
      {
        model: Warehouse,
        as: "warehouse",
        attributes: ["id", "name"],
      },
    ],
    order: [["name", "ASC"]],
  });
  return areas;
};

export const createArea = async (data: AreaCreationAttributes) => {
  // Cek apakah warehouse_id valid
  const warehouse = await Warehouse.findByPk(data.warehouse_id);
  if (!warehouse) {
    throw new ApiError(400, "Warehouse ID tidak valid");
  }
  const area = await Area.create(data);
  return area;
};

export const updateArea = async (
  id: string,
  data: Partial<AreaCreationAttributes>
) => {
  const area = await Area.findByPk(id);
  if (!area) throw new ApiError(404, "Area not found");

  // Jika warehouse_id diubah, cek validitasnya
  if (data.warehouse_id) {
    const warehouse = await Warehouse.findByPk(data.warehouse_id);
    if (!warehouse) throw new ApiError(400, "Warehouse ID tidak valid");
  }

  await area.update(data);
  return area;
};

export const deleteArea = async (id: string) => {
  const area = await Area.findByPk(id);
  if (!area) throw new ApiError(404, "Area not found");
  await area.destroy();
};

export const getAreasByWarehouse = async (warehouseId: string) => {
  const areas = await Area.findAll({
    where: { warehouse_id: warehouseId },
    order: [["name", "ASC"]],
  });
  return areas;
};
