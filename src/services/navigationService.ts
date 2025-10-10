// backend/src/services/navigationService.ts
import { Area, Device, Warehouse } from "../db/models";
import { literal } from "sequelize";

export const getAreasBySystemType = async (systemType: string) => {
  const areas = await Area.findAll({
    attributes: [
      "id",
      "name",
      "warehouse_id",
      // Ambil nama gudang melalui relasi
      [literal('"warehouse"."name"'), "warehouse_name"],
    ],
    include: [
      {
        model: Device,
        as: "devices",
        where: { system_type: systemType },
        attributes: [], // Kita tidak butuh data device, hanya untuk join
        required: true, // INNER JOIN: Hanya area yang punya device ini
      },
      {
        model: Warehouse,
        as: "warehouse",
        attributes: [], // Hanya untuk mengambil nama di atas
        required: true,
      },
    ],
    group: ["Area.id", "warehouse.id"], // Group untuk memastikan hasil unik
    order: [["name", "ASC"]],
  });
  return areas;
};
