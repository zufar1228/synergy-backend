// backend/src/services/alertService.ts
import { Incident, Device, Area } from "../db/models";

export const getActiveAlerts = async (warehouseId: string) => {
  const alerts = await Incident.findAll({
    attributes: ["device_id"], // Hanya butuh device_id untuk identifikasi
    where: { status: "unacknowledged" },
    include: [
      {
        model: Device,
        as: "device",
        attributes: ["area_id", "system_type"],
        required: true,
        include: [
          {
            model: Area,
            as: "area",
            attributes: [],
            where: { warehouse_id: warehouseId },
            required: true,
          },
        ],
      },
    ],
    group: [
      "Incident.device_id",
      "device.id",
      "device.area_id",
      "device.system_type",
    ],
  });

  // Kembalikan daftar sederhana { area_id, system_type } yang punya peringatan
  return alerts.map((alert) => {
    const device = alert.get("device") as Device;
    return {
      area_id: device.area_id,
      system_type: device.system_type,
    };
  });
};
