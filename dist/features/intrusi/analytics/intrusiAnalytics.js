"use strict";
/**
 * @file intrusiAnalytics.ts
 * @purpose Analytics query builder for intrusi logs (paginated, filterable)
 * @usedBy analyticsService
 * @deps db/drizzle, schema (intrusi_logs, devices)
 * @exports intrusiAnalyticsConfig
 * @sideEffects DB read (intrusi_logs)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.intrusiAnalyticsConfig = void 0;
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
function buildConditions(query) {
    const conditions = [];
    if (query.status)
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.status, query.status.split(',')));
    if (query.event_type)
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.event_type, query.event_type.split(',')));
    if (query.system_state)
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.system_state, query.system_state.split(',')));
    if (query.door_state)
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.door_state, query.door_state.split(',')));
    if (query.from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.intrusi_logs.timestamp, new Date(query.from)));
    if (query.to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.intrusi_logs.timestamp, new Date(query.to)));
    if (query.area_id) {
        conditions.push((0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.device_id, drizzle_1.db.select({ id: schema_1.devices.id }).from(schema_1.devices).where((0, drizzle_orm_1.eq)(schema_1.devices.area_id, query.area_id))));
    }
    return conditions;
}
exports.intrusiAnalyticsConfig = {
    getLogsAndCount: async (query, limit, offset) => {
        const conditions = buildConditions(query);
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [countResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(whereClause);
        const data = await drizzle_1.db.query.intrusi_logs.findMany({
            where: whereClause,
            with: { device: { columns: { id: true, name: true } } },
            limit,
            offset,
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
        });
        return { count: Number(countResult.count), data };
    },
    getSummary: async (query) => {
        const conditions = buildConditions(query);
        const baseWhere = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(baseWhere);
        const alarmWhere = (0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']));
        const [alarmResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(alarmWhere);
        const impactWhere = (0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.event_type, 'IMPACT_WARNING'));
        const [impactResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(impactWhere);
        const unackWhere = (0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.status, 'unacknowledged'));
        const [unackResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(unackWhere);
        return {
            total_events: Number(totalResult.count),
            alarm_events: Number(alarmResult.count),
            impact_warnings: Number(impactResult.count),
            unacknowledged: Number(unackResult.count)
        };
    }
};
