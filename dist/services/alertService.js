"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveAlerts = void 0;
// backend/src/services/alertService.ts
const models_1 = require("../db/models");
const getActiveAlerts = async (warehouseId) => {
    const alerts = await models_1.Incident.findAll({
        attributes: ["device_id"], // Hanya butuh device_id untuk identifikasi
        where: { status: "unacknowledged" },
        include: [
            {
                model: models_1.Device,
                as: "device",
                attributes: ["area_id", "system_type"],
                required: true,
                include: [
                    {
                        model: models_1.Area,
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
        const device = alert.get("device");
        return {
            area_id: device.area_id,
            system_type: device.system_type,
        };
    });
};
exports.getActiveAlerts = getActiveAlerts;
