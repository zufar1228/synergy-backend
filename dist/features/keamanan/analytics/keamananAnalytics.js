"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keamananAnalyticsConfig = void 0;
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
function buildConditions(query) {
    const conditions = [];
    if (query.status)
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.keamanan_logs.status, query.status.split(',')));
    if (query.from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.keamanan_logs.created_at, new Date(query.from)));
    if (query.to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.keamanan_logs.created_at, new Date(query.to)));
    if (query.area_id) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.keamanan_logs.device_id, drizzle_1.db.select({ id: schema_1.devices.id }).from(schema_1.devices).where((0, drizzle_orm_1.eq)(schema_1.devices.area_id, query.area_id))));
    }
    return conditions;
}
exports.keamananAnalyticsConfig = {
    getLogsAndCount: async (query, limit, offset) => {
        const conditions = buildConditions(query);
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [countResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.keamanan_logs).where(whereClause);
        const data = await drizzle_1.db.query.keamanan_logs.findMany({
            where: whereClause,
            with: { device: { columns: { id: true, name: true } } },
            limit,
            offset,
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.keamanan_logs.created_at)]
        });
        return { count: Number(countResult.count), data };
    },
    getSummary: async (query) => {
        const conditions = buildConditions(query);
        const baseWhere = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.keamanan_logs).where(baseWhere);
        const unackWhere = (0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.keamanan_logs.status, 'unacknowledged'));
        const [unackResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.keamanan_logs).where(unackWhere);
        return {
            total_detections: Number(totalResult.count),
            unacknowledged_alerts: Number(unackResult.count)
        };
    }
};
