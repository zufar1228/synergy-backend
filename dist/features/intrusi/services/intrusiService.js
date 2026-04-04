"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateIntrusiLogStatus = exports.getIntrusiStatus = exports.getIntrusiSummary = exports.getIntrusiLogs = exports.ingestIntrusiEvent = void 0;
// backend/src/services/intrusiService.ts
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../../../utils/apiError"));
/**
 * Ingest a door-security event from MQTT into the database.
 */
const ingestIntrusiEvent = async (data) => {
    const [log] = await drizzle_1.db
        .insert(schema_1.intrusi_logs)
        .values({
        device_id: data.device_id,
        event_type: data.event_type,
        system_state: data.system_state,
        door_state: data.door_state,
        peak_delta_g: data.peak_delta_g ?? null,
        hit_count: data.hit_count ?? null,
        payload: data.payload
    })
        .returning();
    console.log(`[IntrusiService] Ingested ${data.event_type} event for device ${data.device_id}`);
    return log;
};
exports.ingestIntrusiEvent = ingestIntrusiEvent;
/**
 * Get intrusion logs for a device with pagination and filters.
 */
const getIntrusiLogs = async (options) => {
    const { device_id, limit = 50, offset = 0, from, to, event_type } = options;
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id)];
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.intrusi_logs.timestamp, new Date(from)));
    if (to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.intrusi_logs.timestamp, new Date(to)));
    if (event_type)
        conditions.push((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.event_type, event_type));
    const whereClause = (0, drizzle_orm_1.and)(...conditions);
    const [countResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.intrusi_logs)
        .where(whereClause);
    const total = Number(countResult.count);
    const data = await drizzle_1.db.query.intrusi_logs.findMany({
        where: whereClause,
        limit,
        offset,
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
    });
    return {
        data,
        pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
        }
    };
};
exports.getIntrusiLogs = getIntrusiLogs;
/**
 * Get summary statistics for a device's intrusion events.
 */
const getIntrusiSummary = async (device_id, from, to) => {
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id)];
    if (from)
        conditions.push((0, drizzle_orm_1.gte)(schema_1.intrusi_logs.timestamp, new Date(from)));
    if (to)
        conditions.push((0, drizzle_orm_1.lte)(schema_1.intrusi_logs.timestamp, new Date(to)));
    const baseWhere = (0, drizzle_orm_1.and)(...conditions);
    const [totalResult] = await drizzle_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(schema_1.intrusi_logs).where(baseWhere);
    const [alarmResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.intrusi_logs)
        .where((0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'])));
    const [impactResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.intrusi_logs)
        .where((0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.event_type, 'IMPACT_WARNING')));
    const [unackResult] = await drizzle_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(schema_1.intrusi_logs)
        .where((0, drizzle_orm_1.and)(...conditions, (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.status, 'unacknowledged')));
    const latest_event = await drizzle_1.db.query.intrusi_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
    });
    return {
        total_events: Number(totalResult.count),
        alarm_events: Number(alarmResult.count),
        impact_warnings: Number(impactResult.count),
        unacknowledged: Number(unackResult.count),
        latest_event
    };
};
exports.getIntrusiSummary = getIntrusiSummary;
/**
 * Get current door security status for a device.
 */
const getIntrusiStatus = async (device_id) => {
    const latestEvent = await drizzle_1.db.query.intrusi_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
    });
    const latestAlarm = await drizzle_1.db.query.intrusi_logs.findFirst({
        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id), (0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'])),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
    });
    let status = 'AMAN';
    const currentSystemState = latestEvent?.system_state ?? 'DISARMED';
    if (latestAlarm && latestAlarm.status === 'unacknowledged') {
        const clearingEvent = await drizzle_1.db.query.intrusi_logs.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id), (0, drizzle_orm_1.inArray)(schema_1.intrusi_logs.event_type, ['DISARM', 'SIREN_SILENCED']), (0, drizzle_orm_1.gt)(schema_1.intrusi_logs.timestamp, latestAlarm.timestamp)),
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
        });
        if (clearingEvent || currentSystemState === 'DISARMED') {
            status = 'AMAN';
        }
        else {
            status = 'BAHAYA';
        }
    }
    const latestImpact = await drizzle_1.db.query.intrusi_logs.findFirst({
        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device_id), (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.event_type, 'IMPACT_WARNING')),
        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
    });
    if (status === 'AMAN' &&
        currentSystemState === 'ARMED' &&
        latestImpact &&
        latestImpact.status === 'unacknowledged') {
        status = 'WASPADA';
    }
    return {
        status,
        system_state: latestEvent?.system_state ?? 'DISARMED',
        door_state: latestEvent?.door_state ?? 'CLOSED',
        latest_event: latestEvent,
        latest_alarm: latestAlarm
    };
};
exports.getIntrusiStatus = getIntrusiStatus;
/**
 * Update the acknowledgement status of an intrusion log.
 */
const updateIntrusiLogStatus = async (logId, userId, status, notes) => {
    const existing = await drizzle_1.db.query.intrusi_logs.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.id, logId)
    });
    if (!existing)
        throw new apiError_1.default(404, 'Log intrusi tidak ditemukan.');
    const [updated] = await drizzle_1.db
        .update(schema_1.intrusi_logs)
        .set({
        status,
        notes: notes || existing.notes,
        acknowledged_by: userId,
        acknowledged_at: new Date()
    })
        .where((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.id, logId))
        .returning();
    return updated;
};
exports.updateIntrusiLogStatus = updateIntrusiLogStatus;
