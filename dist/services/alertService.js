"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveAlerts = void 0;
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const getActiveAlerts = async (warehouseId) => {
    const alerts = await drizzle_1.db
        .selectDistinct({
        area_id: schema_1.devices.area_id,
        system_type: schema_1.devices.system_type
    })
        .from(schema_1.incidents)
        .innerJoin(schema_1.devices, (0, drizzle_orm_1.eq)(schema_1.incidents.device_id, schema_1.devices.id))
        .innerJoin(schema_1.areas, (0, drizzle_orm_1.eq)(schema_1.devices.area_id, schema_1.areas.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.incidents.status, 'unacknowledged'), (0, drizzle_orm_1.eq)(schema_1.areas.warehouse_id, warehouseId)));
    return alerts;
};
exports.getActiveAlerts = getActiveAlerts;
