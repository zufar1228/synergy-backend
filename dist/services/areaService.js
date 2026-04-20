"use strict";
/**
 * @file areaService.ts
 * @purpose CRUD operations for areas with warehouse validation
 * @usedBy areaController
 * @deps db/drizzle, schema (areas, warehouses, devices), ApiError
 * @exports getAllAreas, createArea, updateArea, deleteArea, getAreasByWarehouse
 * @sideEffects DB read/write (areas)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAreasByWarehouse = exports.deleteArea = exports.updateArea = exports.createArea = exports.getAllAreas = void 0;
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../utils/apiError"));
const getAllAreas = async () => {
    return await drizzle_1.db.query.areas.findMany({
        with: {
            warehouse: { columns: { id: true, name: true } }
        },
        orderBy: [(0, drizzle_orm_1.asc)(schema_1.areas.name)]
    });
};
exports.getAllAreas = getAllAreas;
const createArea = async (data) => {
    const warehouse = await drizzle_1.db.query.warehouses.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.warehouses.id, data.warehouse_id)
    });
    if (!warehouse)
        throw new apiError_1.default(400, 'Warehouse ID tidak valid');
    const [area] = await drizzle_1.db
        .insert(schema_1.areas)
        .values({ warehouse_id: data.warehouse_id, name: data.name })
        .returning();
    return area;
};
exports.createArea = createArea;
const updateArea = async (id, data) => {
    const area = await drizzle_1.db.query.areas.findFirst({ where: (0, drizzle_orm_1.eq)(schema_1.areas.id, id) });
    if (!area)
        throw new apiError_1.default(404, 'Area not found');
    if (data.warehouse_id) {
        const warehouse = await drizzle_1.db.query.warehouses.findFirst({
            where: (0, drizzle_orm_1.eq)(schema_1.warehouses.id, data.warehouse_id)
        });
        if (!warehouse)
            throw new apiError_1.default(400, 'Warehouse ID tidak valid');
    }
    const [updated] = await drizzle_1.db
        .update(schema_1.areas)
        .set({ ...data, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.areas.id, id))
        .returning();
    return updated;
};
exports.updateArea = updateArea;
const deleteArea = async (id) => {
    const area = await drizzle_1.db.query.areas.findFirst({ where: (0, drizzle_orm_1.eq)(schema_1.areas.id, id) });
    if (!area)
        throw new apiError_1.default(404, 'Area not found');
    const childDevices = await drizzle_1.db.query.devices.findMany({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.area_id, id),
        columns: { id: true }
    });
    if (childDevices.length > 0) {
        throw new apiError_1.default(409, `Area ini masih memiliki ${childDevices.length} perangkat. Hapus perangkat terlebih dahulu.`);
    }
    await drizzle_1.db.delete(schema_1.areas).where((0, drizzle_orm_1.eq)(schema_1.areas.id, id));
};
exports.deleteArea = deleteArea;
const getAreasByWarehouse = async (warehouseId) => {
    return await drizzle_1.db.query.areas.findMany({
        where: (0, drizzle_orm_1.eq)(schema_1.areas.warehouse_id, warehouseId),
        orderBy: [(0, drizzle_orm_1.asc)(schema_1.areas.name)]
    });
};
exports.getAreasByWarehouse = getAreasByWarehouse;
