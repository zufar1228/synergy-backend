"use strict";
// backend/src/services/intrusiService.ts
// Service untuk menangani operasi terkait Intrusion Detection (TinyML)
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeviceInAlertState = exports.getIntrusiSummary = exports.getIntrusiLogs = exports.getDeviceWithRelations = exports.saveIntrusiLog = exports.validateTinyMLPayload = void 0;
const models_1 = require("../db/models");
const sequelize_1 = require("sequelize");
// Validate incoming TinyML payload
const validateTinyMLPayload = (data) => {
    // Validate event class
    const validEvents = ["Normal", "Disturbance", "Intrusion"];
    if (!data.event || !validEvents.includes(data.event)) {
        console.error(`[IntrusiService] Invalid event class: ${data.event}`);
        return null;
    }
    // Validate confidence (0.0 - 1.0)
    const conf = parseFloat(data.conf);
    if (isNaN(conf) || conf < 0 || conf > 1) {
        console.error(`[IntrusiService] Invalid confidence: ${data.conf}`);
        return null;
    }
    return {
        event: data.event,
        conf: conf,
        ts: data.ts,
    };
};
exports.validateTinyMLPayload = validateTinyMLPayload;
// Save intrusion log to database
const saveIntrusiLog = async (deviceId, payload) => {
    try {
        const log = await models_1.IntrusiLog.create({
            device_id: deviceId,
            event_class: payload.event,
            confidence: payload.conf,
            payload: payload,
            timestamp: payload.ts ? new Date(payload.ts) : new Date(),
        });
        console.log(`[IntrusiService] ✅ Saved: ${payload.event} (${(payload.conf * 100).toFixed(1)}%)`);
        return log;
    }
    catch (error) {
        console.error("[IntrusiService] ❌ Error saving log:", error);
        return null;
    }
};
exports.saveIntrusiLog = saveIntrusiLog;
// Get device with relations for alerting
const getDeviceWithRelations = async (deviceId) => {
    try {
        const device = await models_1.Device.findByPk(deviceId, {
            include: [
                {
                    model: models_1.Area,
                    as: "area",
                    include: [{ model: models_1.Warehouse, as: "warehouse" }],
                },
            ],
        });
        return device;
    }
    catch (error) {
        console.error("[IntrusiService] ❌ Error fetching device:", error);
        return null;
    }
};
exports.getDeviceWithRelations = getDeviceWithRelations;
// Get intrusion logs for a device with pagination
const getIntrusiLogs = async (deviceId, options = {}) => {
    const { limit = 50, offset = 0, from, to, eventClass } = options;
    const whereClause = { device_id: deviceId };
    if (from || to) {
        whereClause.timestamp = {};
        if (from)
            whereClause.timestamp[sequelize_1.Op.gte] = from;
        if (to)
            whereClause.timestamp[sequelize_1.Op.lte] = to;
    }
    if (eventClass) {
        whereClause.event_class = eventClass;
    }
    try {
        const { rows: logs, count: total } = await models_1.IntrusiLog.findAndCountAll({
            where: whereClause,
            order: [["timestamp", "DESC"]],
            limit,
            offset,
        });
        return { logs, total, limit, offset };
    }
    catch (error) {
        console.error("[IntrusiService] ❌ Error fetching logs:", error);
        return { logs: [], total: 0, limit, offset };
    }
};
exports.getIntrusiLogs = getIntrusiLogs;
// Get summary statistics for a device
const getIntrusiSummary = async (deviceId, from, to) => {
    const whereClause = { device_id: deviceId };
    if (from || to) {
        whereClause.timestamp = {};
        if (from)
            whereClause.timestamp[sequelize_1.Op.gte] = from;
        if (to)
            whereClause.timestamp[sequelize_1.Op.lte] = to;
    }
    try {
        const totalEvents = await models_1.IntrusiLog.count({ where: whereClause });
        const intrusions = await models_1.IntrusiLog.count({
            where: { ...whereClause, event_class: "Intrusion" },
        });
        const disturbances = await models_1.IntrusiLog.count({
            where: { ...whereClause, event_class: "Disturbance" },
        });
        const normals = await models_1.IntrusiLog.count({
            where: { ...whereClause, event_class: "Normal" },
        });
        // Get latest event
        const latestEvent = await models_1.IntrusiLog.findOne({
            where: { device_id: deviceId },
            order: [["timestamp", "DESC"]],
        });
        return {
            total_events: totalEvents,
            intrusions,
            disturbances,
            normals,
            latest_event: latestEvent,
        };
    }
    catch (error) {
        console.error("[IntrusiService] ❌ Error fetching summary:", error);
        return {
            total_events: 0,
            intrusions: 0,
            disturbances: 0,
            normals: 0,
            latest_event: null,
        };
    }
};
exports.getIntrusiSummary = getIntrusiSummary;
// Check if device is in alert state (recent intrusion)
const isDeviceInAlertState = async (deviceId, minutesThreshold = 5) => {
    try {
        const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000);
        const recentIntrusion = await models_1.IntrusiLog.findOne({
            where: {
                device_id: deviceId,
                event_class: "Intrusion",
                timestamp: { [sequelize_1.Op.gte]: thresholdTime },
            },
        });
        return recentIntrusion !== null;
    }
    catch (error) {
        console.error("[IntrusiService] ❌ Error checking alert state:", error);
        return false;
    }
};
exports.isDeviceInAlertState = isDeviceInAlertState;
