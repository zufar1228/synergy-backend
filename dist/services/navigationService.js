"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAreasBySystemType = void 0;
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const getAreasBySystemType = async (systemType) => {
    const result = await drizzle_1.db
        .selectDistinct({
        id: schema_1.areas.id,
        name: schema_1.areas.name,
        warehouse_id: schema_1.areas.warehouse_id,
        warehouse_name: schema_1.warehouses.name
    })
        .from(schema_1.areas)
        .innerJoin(schema_1.devices, (0, drizzle_orm_1.eq)(schema_1.areas.id, schema_1.devices.area_id))
        .innerJoin(schema_1.warehouses, (0, drizzle_orm_1.eq)(schema_1.areas.warehouse_id, schema_1.warehouses.id))
        .where((0, drizzle_orm_1.eq)(schema_1.devices.system_type, systemType))
        .orderBy((0, drizzle_orm_1.asc)(schema_1.areas.name));
    return result;
};
exports.getAreasBySystemType = getAreasBySystemType;
