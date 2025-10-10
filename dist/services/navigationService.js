"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAreasBySystemType = void 0;
// backend/src/services/navigationService.ts
const models_1 = require("../db/models");
const sequelize_1 = require("sequelize");
const getAreasBySystemType = async (systemType) => {
    const areas = await models_1.Area.findAll({
        attributes: [
            "id",
            "name",
            "warehouse_id",
            // Ambil nama gudang melalui relasi
            [(0, sequelize_1.literal)('"warehouse"."name"'), "warehouse_name"],
        ],
        include: [
            {
                model: models_1.Device,
                as: "devices",
                where: { system_type: systemType },
                attributes: [], // Kita tidak butuh data device, hanya untuk join
                required: true, // INNER JOIN: Hanya area yang punya device ini
            },
            {
                model: models_1.Warehouse,
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
exports.getAreasBySystemType = getAreasBySystemType;
