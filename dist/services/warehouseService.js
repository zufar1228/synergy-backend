"use strict";
/**
 * @file warehouseService.ts
 * @purpose CRUD operations for warehouses with area/device stats
 * @usedBy warehouseController
 * @deps db/drizzle, schema (warehouses, areas, devices), ApiError
 * @exports getWarehouseWithAreaSystems, getAllWarehousesWithStats, createWarehouse, updateWarehouse, deleteWarehouse
 * @sideEffects DB read/write (warehouses)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWarehouse = exports.updateWarehouse = exports.createWarehouse = exports.getAllWarehousesWithStats = exports.getWarehouseWithAreaSystems = void 0;
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../utils/apiError"));
const getWarehouseWithAreaSystems = async (warehouseId) => {
    const warehouse = await drizzle_1.db.query.warehouses.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.warehouses.id, warehouseId),
        with: {
            areas: {
                with: {
                    devices: {
                        columns: { system_type: true, status: true }
                    }
                },
                orderBy: [(0, drizzle_orm_1.asc)(schema_1.areas.name)]
            }
        }
    });
    if (!warehouse) {
        throw new apiError_1.default(404, 'Warehouse not found');
    }
    // Count total and online devices in this warehouse
    const [deviceStats] = await drizzle_1.db
        .select({
        total: (0, drizzle_orm_1.sql) `cast(count(*) as int)`,
        online: (0, drizzle_orm_1.sql) `cast(count(*) filter (where ${schema_1.devices.status} = 'Online') as int)`
    })
        .from(schema_1.devices)
        .innerJoin(schema_1.areas, (0, drizzle_orm_1.eq)(schema_1.devices.area_id, schema_1.areas.id))
        .where((0, drizzle_orm_1.eq)(schema_1.areas.warehouse_id, warehouseId));
    const transformedAreas = warehouse.areas.map((area) => {
        const systemsMap = new Map();
        area.devices.forEach((device) => {
            systemsMap.set(device.system_type, {
                device_count: 1,
                status: device.status
            });
        });
        const activeSystems = Array.from(systemsMap.entries()).map(([type, data]) => ({
            system_type: type,
            device_count: data.device_count,
            status: data.status
        }));
        return { id: area.id, name: area.name, active_systems: activeSystems };
    });
    return {
        id: warehouse.id,
        name: warehouse.name,
        location: warehouse.location,
        areaCount: warehouse.areas.length,
        deviceCount: deviceStats?.total ?? 0,
        onlineDeviceCount: deviceStats?.online ?? 0,
        areas: transformedAreas
    };
};
exports.getWarehouseWithAreaSystems = getWarehouseWithAreaSystems;
const getAllWarehousesWithStats = async () => {
    const result = await drizzle_1.db
        .select({
        id: schema_1.warehouses.id,
        name: schema_1.warehouses.name,
        location: schema_1.warehouses.location,
        created_at: schema_1.warehouses.created_at,
        updated_at: schema_1.warehouses.updated_at,
        areaCount: (0, drizzle_orm_1.sql) `cast((SELECT count(*) FROM areas WHERE areas.warehouse_id = "warehouses"."id") as int)`,
        deviceCount: (0, drizzle_orm_1.sql) `cast((SELECT count(*) FROM devices JOIN areas ON devices.area_id = areas.id WHERE areas.warehouse_id = "warehouses"."id") as int)`,
        onlineDeviceCount: (0, drizzle_orm_1.sql) `cast((SELECT count(*) FROM devices JOIN areas ON devices.area_id = areas.id WHERE areas.warehouse_id = "warehouses"."id" AND devices.status = 'Online') as int)`
    })
        .from(schema_1.warehouses)
        .orderBy((0, drizzle_orm_1.asc)(schema_1.warehouses.name));
    return result;
};
exports.getAllWarehousesWithStats = getAllWarehousesWithStats;
const createWarehouse = async (data) => {
    const [warehouse] = await drizzle_1.db.insert(schema_1.warehouses).values(data).returning();
    return warehouse;
};
exports.createWarehouse = createWarehouse;
const updateWarehouse = async (id, data) => {
    const warehouse = await drizzle_1.db.query.warehouses.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.warehouses.id, id)
    });
    if (!warehouse)
        throw new apiError_1.default(404, 'Warehouse not found');
    const [updated] = await drizzle_1.db
        .update(schema_1.warehouses)
        .set({ ...data, updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.warehouses.id, id))
        .returning();
    return updated;
};
exports.updateWarehouse = updateWarehouse;
const deleteWarehouse = async (id) => {
    const warehouse = await drizzle_1.db.query.warehouses.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.warehouses.id, id)
    });
    if (!warehouse)
        throw new apiError_1.default(404, 'Warehouse not found');
    const childAreas = await drizzle_1.db.query.areas.findMany({
        where: (0, drizzle_orm_1.eq)(schema_1.areas.warehouse_id, id),
        columns: { id: true }
    });
    if (childAreas.length > 0) {
        throw new apiError_1.default(409, `Gudang ini masih memiliki ${childAreas.length} area. Hapus area terlebih dahulu.`);
    }
    await drizzle_1.db.delete(schema_1.warehouses).where((0, drizzle_orm_1.eq)(schema_1.warehouses.id, id));
};
exports.deleteWarehouse = deleteWarehouse;
