"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionStats = exports.getStatistics = exports.getRawData = exports.insertDeviceStatus = exports.getDeviceStatus = void 0;
const drizzle_1 = require("../../../db/drizzle");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Get latest device status from calibration_device_status table
 */
const getDeviceStatus = async (deviceId) => {
    const result = await drizzle_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM calibration_device_status 
        WHERE device_id = ${deviceId} 
        ORDER BY created_at DESC LIMIT 1`);
    return result.rows[0] || null;
};
exports.getDeviceStatus = getDeviceStatus;
/**
 * Insert calibration device status (from MQTT heartbeat)
 */
const insertDeviceStatus = async (data) => {
    await drizzle_1.db.execute((0, drizzle_orm_1.sql) `INSERT INTO calibration_device_status 
        (session, recording, trial, uptime_sec, wifi_rssi, free_heap, offline_buf, device_id)
        VALUES (${data.session}, ${data.recording}, ${data.trial}, ${data.uptime_sec}, 
                ${data.wifi_rssi}, ${data.free_heap}, ${data.offline_buf}, ${data.device_id})`);
};
exports.insertDeviceStatus = insertDeviceStatus;
/**
 * Get raw calibration data for a session (paginated)
 */
const getRawData = async (session, options) => {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    let query;
    if (options.trial) {
        query = (0, drizzle_orm_1.sql) `SELECT * FROM calibration_raw 
                WHERE session = ${session} AND trial = ${options.trial}
                ORDER BY created_at DESC 
                LIMIT ${limit} OFFSET ${offset}`;
    }
    else {
        query = (0, drizzle_orm_1.sql) `SELECT * FROM calibration_raw 
                WHERE session = ${session}
                ORDER BY created_at DESC 
                LIMIT ${limit} OFFSET ${offset}`;
    }
    const result = await drizzle_1.db.execute(query);
    // Get total count
    let countQuery;
    if (options.trial) {
        countQuery = (0, drizzle_orm_1.sql) `SELECT COUNT(*)::int as total FROM calibration_raw 
                     WHERE session = ${session} AND trial = ${options.trial}`;
    }
    else {
        countQuery = (0, drizzle_orm_1.sql) `SELECT COUNT(*)::int as total FROM calibration_raw 
                     WHERE session = ${session}`;
    }
    const countResult = await drizzle_1.db.execute(countQuery);
    const total = countResult.rows[0]?.total || 0;
    return {
        data: result.rows,
        pagination: { total, limit, offset }
    };
};
exports.getRawData = getRawData;
/**
 * Get per-trial statistics from calibration_statistics view
 */
const getStatistics = async (session) => {
    let query;
    if (session) {
        query = (0, drizzle_orm_1.sql) `SELECT * FROM calibration_statistics WHERE session = ${session} ORDER BY session, trial`;
    }
    else {
        query = (0, drizzle_orm_1.sql) `SELECT * FROM calibration_statistics ORDER BY session, trial`;
    }
    const result = await drizzle_1.db.execute(query);
    return result.rows;
};
exports.getStatistics = getStatistics;
/**
 * Get per-session aggregate stats from calibration_session_stats view
 */
const getSessionStats = async () => {
    const result = await drizzle_1.db.execute((0, drizzle_orm_1.sql) `SELECT * FROM calibration_session_stats ORDER BY session`);
    return result.rows;
};
exports.getSessionStats = getSessionStats;
