"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateIntrusiLogStatus = exports.getIntrusiStatus = exports.getIntrusiSummary = exports.getIntrusiLogs = exports.ingestIntrusiEvent = void 0;
// backend/src/services/intrusiService.ts
const sequelize_1 = require("sequelize");
const intrusiLog_1 = __importDefault(require("../models/intrusiLog"));
const apiError_1 = __importDefault(require("../../../utils/apiError"));
/**
 * Ingest a door-security event from MQTT into the database.
 */
const ingestIntrusiEvent = async (data) => {
    const log = await intrusiLog_1.default.create({
        device_id: data.device_id,
        event_type: data.event_type,
        system_state: data.system_state,
        door_state: data.door_state,
        peak_delta_g: data.peak_delta_g ?? null,
        hit_count: data.hit_count ?? null,
        payload: data.payload
    });
    console.log(`[IntrusiService] Ingested ${data.event_type} event for device ${data.device_id}`);
    return log;
};
exports.ingestIntrusiEvent = ingestIntrusiEvent;
/**
 * Get intrusion logs for a device with pagination and filters.
 */
const getIntrusiLogs = async (options) => {
    const { device_id, limit = 50, offset = 0, from, to, event_type } = options;
    const where = { device_id };
    if (from || to) {
        where.timestamp = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    if (event_type) {
        where.event_type = event_type;
    }
    const { count, rows } = await intrusiLog_1.default.findAndCountAll({
        where,
        limit,
        offset,
        order: [['timestamp', 'DESC']]
    });
    return {
        data: rows,
        pagination: {
            total: count,
            limit,
            offset,
            hasMore: offset + limit < count
        }
    };
};
exports.getIntrusiLogs = getIntrusiLogs;
/**
 * Get summary statistics for a device's intrusion events.
 */
const getIntrusiSummary = async (device_id, from, to) => {
    const where = { device_id };
    if (from || to) {
        where.timestamp = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    const total_events = await intrusiLog_1.default.count({ where });
    const alarm_events = await intrusiLog_1.default.count({
        where: {
            ...where,
            event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
        }
    });
    const impact_warnings = await intrusiLog_1.default.count({
        where: { ...where, event_type: 'IMPACT_WARNING' }
    });
    const unacknowledged = await intrusiLog_1.default.count({
        where: { ...where, status: 'unacknowledged' }
    });
    const latest_event = await intrusiLog_1.default.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    return {
        total_events,
        alarm_events,
        impact_warnings,
        unacknowledged,
        latest_event
    };
};
exports.getIntrusiSummary = getIntrusiSummary;
/**
 * Get current door security status for a device.
 */
const getIntrusiStatus = async (device_id) => {
    // Get the latest event to determine current state
    const latestEvent = await intrusiLog_1.default.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    // Get the latest alarm event (if any)
    const latestAlarm = await intrusiLog_1.default.findOne({
        where: {
            device_id,
            event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
        },
        order: [['timestamp', 'DESC']]
    });
    // Determine overall status
    let status = 'AMAN';
    // Current system state from the latest event
    const currentSystemState = latestEvent?.system_state ?? 'DISARMED';
    if (latestAlarm && latestAlarm.status === 'unacknowledged') {
        // Check if a DISARM or SIREN_SILENCED event occurred AFTER the alarm.
        // If yes, the operator has responded — downgrade from BAHAYA.
        const clearingEvent = await intrusiLog_1.default.findOne({
            where: {
                device_id,
                event_type: ['DISARM', 'SIREN_SILENCED'],
                timestamp: { [sequelize_1.Op.gt]: latestAlarm.timestamp }
            },
            order: [['timestamp', 'DESC']]
        });
        if (clearingEvent || currentSystemState === 'DISARMED') {
            // Operator responded (disarmed or silenced siren) → AMAN
            status = 'AMAN';
        }
        else {
            status = 'BAHAYA';
        }
    }
    // Get latest impact warning
    const latestImpact = await intrusiLog_1.default.findOne({
        where: { device_id, event_type: 'IMPACT_WARNING' },
        order: [['timestamp', 'DESC']]
    });
    // Only show WASPADA if system is ARMED and no clearing event after the warning
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
    const log = await intrusiLog_1.default.findByPk(logId);
    if (!log)
        throw new apiError_1.default(404, 'Log intrusi tidak ditemukan.');
    log.status = status;
    log.notes = notes || log.notes;
    log.acknowledged_by = userId;
    log.acknowledged_at = new Date();
    await log.save();
    return log;
};
exports.updateIntrusiLogStatus = updateIntrusiLogStatus;
