"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateIntrusiLogStatus = exports.getIntrusiStatus = exports.getIntrusiSummary = exports.getIntrusiLogs = exports.ingestIntrusiEvent = void 0;
// backend/src/services/intrusiService.ts
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
/**
 * Ingest a door-security event from MQTT into the database.
 */
const ingestIntrusiEvent = async (data) => {
    const log = await models_1.IntrusiLog.create({
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
            ...(from && { $gte: new Date(from) }),
            ...(to && { $lte: new Date(to) })
        };
    }
    if (event_type) {
        where.event_type = event_type;
    }
    const { count, rows } = await models_1.IntrusiLog.findAndCountAll({
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
            ...(from && { $gte: new Date(from) }),
            ...(to && { $lte: new Date(to) })
        };
    }
    const total_events = await models_1.IntrusiLog.count({ where });
    const alarm_events = await models_1.IntrusiLog.count({
        where: {
            ...where,
            event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
        }
    });
    const impact_warnings = await models_1.IntrusiLog.count({
        where: { ...where, event_type: 'IMPACT_WARNING' }
    });
    const unacknowledged = await models_1.IntrusiLog.count({
        where: { ...where, status: 'unacknowledged' }
    });
    const latest_event = await models_1.IntrusiLog.findOne({
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
    const latestEvent = await models_1.IntrusiLog.findOne({
        where: { device_id },
        order: [['timestamp', 'DESC']]
    });
    // Get the latest alarm event (if any)
    const latestAlarm = await models_1.IntrusiLog.findOne({
        where: {
            device_id,
            event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
        },
        order: [['timestamp', 'DESC']]
    });
    // Determine overall status
    let status = 'AMAN';
    if (latestAlarm) {
        if (latestAlarm.status === 'unacknowledged') {
            status = 'BAHAYA';
        }
        // Once acknowledged/resolved/false_alarm → AMAN (no lingering WASPADA)
    }
    // Get latest impact warning
    const latestImpact = await models_1.IntrusiLog.findOne({
        where: { device_id, event_type: 'IMPACT_WARNING' },
        order: [['timestamp', 'DESC']]
    });
    if (status === 'AMAN' &&
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
    const log = await models_1.IntrusiLog.findByPk(logId);
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
