"use strict";
// backend/src/services/warehouseService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWarehouse = exports.updateWarehouse = exports.createWarehouse = exports.getAllWarehousesWithStats = exports.getWarehouseWithAreaSystems = void 0;
const models_1 = require("../db/models");
const config_1 = require("../db/config");
const apiError_1 = __importDefault(require("../utils/apiError"));
const getWarehouseWithAreaSystems = async (warehouseId) => {
    const warehouse = (await models_1.Warehouse.findByPk(warehouseId, {
        include: [
            {
                model: models_1.Area,
                as: "areas",
                attributes: ["id", "name"],
                include: [
                    {
                        model: models_1.Device,
                        as: "devices",
                        // === PERUBAHAN DI SINI: Ambil juga statusnya ===
                        attributes: ["system_type", "status"],
                    },
                ],
            },
        ],
        order: [[{ model: models_1.Area, as: "areas" }, "name", "ASC"]],
    }));
    if (!warehouse) {
        throw new apiError_1.default(404, "Warehouse not found");
    }
    // === PERBAIKAN: Ganti query statistik yang kompleks dengan yang lebih sederhana ===
    const commonWhere = {
        include: [
            {
                model: models_1.Area,
                as: "area",
                attributes: [],
                where: { warehouse_id: warehouseId },
            },
        ],
    };
    // 1. Hitung total perangkat di gudang ini
    const totalDeviceCount = await models_1.Device.count(commonWhere);
    // 2. Hitung perangkat yang online di gudang ini
    const onlineDeviceCount = await models_1.Device.count({
        ...commonWhere,
        where: { status: "Online" },
    });
    // ======================================================================
    const warehouseData = warehouse.toJSON();
    // === PERUBAHAN DI SINI: Proses data status ===
    const transformedAreas = warehouseData.areas.map((area) => {
        const systemsMap = new Map();
        area.devices.forEach((device) => {
            // Asumsi 1 tipe sistem per area, statusnya langsung diambil
            systemsMap.set(device.system_type, {
                device_count: 1,
                status: device.status,
            });
        });
        const activeSystems = Array.from(systemsMap.entries()).map(([type, data]) => ({
            system_type: type,
            device_count: data.device_count,
            status: data.status, // <-- Kirim status ke frontend
        }));
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
exports.getWarehouseWithAreaSystems = getWarehouseWithAreaSystems;
const getAllWarehousesWithStats = async () => {
    const warehouses = await models_1.Warehouse.findAll({
        attributes: {
            include: [
                // Subquery untuk menghitung jumlah area
                [
                    config_1.sequelize.literal('(SELECT COUNT(*) FROM areas WHERE areas.warehouse_id = "Warehouse"."id")'),
                    "areaCount",
                ],
                // Subquery untuk menghitung jumlah total perangkat
                [
                    config_1.sequelize.literal(`(
            SELECT COUNT(*) FROM devices 
            JOIN areas ON devices.area_id = areas.id 
            WHERE areas.warehouse_id = "Warehouse"."id"
          )`),
                    "deviceCount",
                ],
                // Subquery untuk menghitung jumlah perangkat yang online
                [
                    config_1.sequelize.literal(`(
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
exports.getAllWarehousesWithStats = getAllWarehousesWithStats;
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
