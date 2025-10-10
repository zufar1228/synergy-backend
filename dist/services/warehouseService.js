"use strict";
// backend/src/services/warehouseService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWarehouse = exports.updateWarehouse = exports.createWarehouse = exports.getAllWarehouses = exports.getWarehouseWithAreaSystems = void 0;
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const getWarehouseWithAreaSystems = async (warehouseId) => {
    const warehouse = await models_1.Warehouse.findByPk(warehouseId, {
        include: [
            {
                model: models_1.Area,
                as: "areas",
                attributes: ["id", "name"],
                include: [
                    {
                        model: models_1.Device,
                        as: "devices",
                        attributes: ["system_type"],
                    },
                ],
            },
        ],
        order: [[{ model: models_1.Area, as: "areas" }, "name", "ASC"]],
    });
    if (!warehouse) {
        throw new apiError_1.default(404, "Warehouse not found");
    }
    // 2. Gunakan type assertion 'as' untuk memberitahu TypeScript
    //    bahwa kita tahu struktur data yang benar.
    const warehouseData = warehouse.toJSON();
    // Sekarang TypeScript tahu bahwa warehouseData.areas adalah array AreaWithDevices
    const transformedAreas = warehouseData.areas.map((area) => {
        // <-- 'area' sekarang punya tipe yang benar
        const systemSummary = {};
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
exports.getWarehouseWithAreaSystems = getWarehouseWithAreaSystems;
const getAllWarehouses = async () => {
    const warehouses = await models_1.Warehouse.findAll({
        order: [["name", "ASC"]],
    });
    return warehouses;
};
exports.getAllWarehouses = getAllWarehouses;
const createWarehouse = async (data) => {
    const warehouse = await models_1.Warehouse.create(data);
    return warehouse;
};
exports.createWarehouse = createWarehouse;
const updateWarehouse = async (id, data) => {
    const warehouse = await models_1.Warehouse.findByPk(id);
    if (!warehouse)
        throw new apiError_1.default(404, "Warehouse not found");
    await warehouse.update(data);
    return warehouse;
};
exports.updateWarehouse = updateWarehouse;
const deleteWarehouse = async (id) => {
    const warehouse = await models_1.Warehouse.findByPk(id);
    if (!warehouse)
        throw new apiError_1.default(404, "Warehouse not found");
    await warehouse.destroy();
};
exports.deleteWarehouse = deleteWarehouse;
