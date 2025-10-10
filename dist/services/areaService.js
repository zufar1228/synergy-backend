"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAreasByWarehouse = exports.deleteArea = exports.updateArea = exports.createArea = exports.getAllAreas = void 0;
// backend/src/services/areaService.ts
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const getAllAreas = async () => {
    // Kita 'include' Warehouse untuk bisa menampilkan nama gudang induknya di UI
    const areas = await models_1.Area.findAll({
        include: [
            {
                model: models_1.Warehouse,
                as: "warehouse",
                attributes: ["id", "name"],
            },
        ],
        order: [["name", "ASC"]],
    });
    return areas;
};
exports.getAllAreas = getAllAreas;
const createArea = async (data) => {
    // Cek apakah warehouse_id valid
    const warehouse = await models_1.Warehouse.findByPk(data.warehouse_id);
    if (!warehouse) {
        throw new apiError_1.default(400, "Warehouse ID tidak valid");
    }
    const area = await models_1.Area.create(data);
    return area;
};
exports.createArea = createArea;
const updateArea = async (id, data) => {
    const area = await models_1.Area.findByPk(id);
    if (!area)
        throw new apiError_1.default(404, "Area not found");
    // Jika warehouse_id diubah, cek validitasnya
    if (data.warehouse_id) {
        const warehouse = await models_1.Warehouse.findByPk(data.warehouse_id);
        if (!warehouse)
            throw new apiError_1.default(400, "Warehouse ID tidak valid");
    }
    await area.update(data);
    return area;
};
exports.updateArea = updateArea;
const deleteArea = async (id) => {
    const area = await models_1.Area.findByPk(id);
    if (!area)
        throw new apiError_1.default(404, "Area not found");
    await area.destroy();
};
exports.deleteArea = deleteArea;
const getAreasByWarehouse = async (warehouseId) => {
    const areas = await models_1.Area.findAll({
        where: { warehouse_id: warehouseId },
        order: [["name", "ASC"]],
    });
    return areas;
};
exports.getAreasByWarehouse = getAreasByWarehouse;
