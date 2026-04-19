/**
 * @file calibrationService.ts
 * @purpose Data access layer for calibration device status, raw data, sessions, and statistics
 * @usedBy calibrationController
 * @deps db/drizzle, drizzle-orm (raw SQL)
 * @exports getDeviceStatus, insertDeviceStatus, getRawData, getDistinctSessions, getSummaryData, getStatistics, getSessionStats, getTrialPeaks, getPeakSummary
 * @sideEffects DB read/write (calibration_device_status, calibration_raw_data)
 */

import { db } from '../../../db/drizzle';
import { sql } from 'drizzle-orm';

/**
 * Get latest device status from calibration_device_status table
 */
export const getDeviceStatus = async (deviceId: string) => {
  const result = await db.execute(
    sql`SELECT * FROM calibration_device_status 
        WHERE device_id = ${deviceId} 
        ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0] || null;
};

/**
 * Insert calibration device status (from MQTT heartbeat)
 */
export const insertDeviceStatus = async (data: {
  session: string;
  recording: boolean;
  trial: number;
  uptime_sec: number;
  wifi_rssi: number;
  free_heap: number;
  offline_buf: number;
  device_id: string;
  door_state?: string;
}) => {
  await db.execute(
    sql`INSERT INTO calibration_device_status 
        (session, recording, trial, uptime_sec, wifi_rssi, free_heap, offline_buf, device_id, door_state)
        VALUES (${data.session}, ${data.recording}, ${data.trial}, ${data.uptime_sec}, 
                ${data.wifi_rssi}, ${data.free_heap}, ${data.offline_buf}, ${data.device_id}, ${data.door_state || null})`
  );
};

/**
 * Get raw calibration data for a session (paginated)
 */
export const getRawData = async (
  options: { session?: string; trial?: number; limit?: number; offset?: number }
) => {
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  const sessionPattern = options.session ? `${options.session}%` : '%';

  let query;
  if (options.trial) {
    query = sql`SELECT * FROM calibration_raw 
                WHERE session LIKE ${sessionPattern} AND trial = ${options.trial}
                ORDER BY created_at DESC 
                LIMIT ${limit} OFFSET ${offset}`;
  } else {
    query = sql`SELECT * FROM calibration_raw 
                WHERE session LIKE ${sessionPattern}
                ORDER BY created_at DESC 
                LIMIT ${limit} OFFSET ${offset}`;
  }

  const result = await db.execute(query);

  // Get total count
  let countQuery;
  if (options.trial) {
    countQuery = sql`SELECT COUNT(*)::int as total FROM calibration_raw 
                     WHERE session LIKE ${sessionPattern} AND trial = ${options.trial}`;
  } else {
    countQuery = sql`SELECT COUNT(*)::int as total FROM calibration_raw 
                     WHERE session LIKE ${sessionPattern}`;
  }
  const countResult = await db.execute(countQuery);
  const total = (countResult.rows[0] as any)?.total || 0;

  return {
    data: result.rows,
    pagination: { total, limit, offset }
  };
};

/**
 * Get distinct session names from calibration_raw
 */
export const getDistinctSessions = async () => {
  const result = await db.execute(
    sql`SELECT DISTINCT session FROM calibration_raw ORDER BY session`
  );
  return result.rows.map((r: any) => r.session as string);
};

/**
 * Get summary data (Session A periodic summaries) from calibration_summary
 */
export const getSummaryData = async (
  options: { session?: string; trial?: number; limit?: number; offset?: number }
) => {
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  let query;
  let countQuery;

  if (options.session) {
    const pattern = `${options.session}%`;
    if (options.trial) {
      query = sql`SELECT * FROM calibration_summary
                  WHERE session LIKE ${pattern} AND trial = ${options.trial}
                  ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      countQuery = sql`SELECT COUNT(*)::int as total FROM calibration_summary
                       WHERE session LIKE ${pattern} AND trial = ${options.trial}`;
    } else {
      query = sql`SELECT * FROM calibration_summary
                  WHERE session LIKE ${pattern}
                  ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      countQuery = sql`SELECT COUNT(*)::int as total FROM calibration_summary
                       WHERE session LIKE ${pattern}`;
    }
  } else {
    query = sql`SELECT * FROM calibration_summary
                ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    countQuery = sql`SELECT COUNT(*)::int as total FROM calibration_summary`;
  }

  const result = await db.execute(query);
  const countResult = await db.execute(countQuery);
  const total = (countResult.rows[0] as any)?.total || 0;

  return {
    data: result.rows,
    pagination: { total, limit, offset }
  };
};

/**
 * Get per-trial statistics from calibration_statistics view
 */
export const getStatistics = async (session?: string) => {
  let query;
  if (session) {
    const pattern = `${session}%`;
    query = sql`SELECT * FROM calibration_statistics WHERE session LIKE ${pattern} ORDER BY session, trial`;
  } else {
    query = sql`SELECT * FROM calibration_statistics ORDER BY session, trial`;
  }
  const result = await db.execute(query);
  return result.rows;
};

/**
 * Get per-session aggregate stats from calibration_session_stats view
 */
export const getSessionStats = async () => {
  const result = await db.execute(
    sql`SELECT * FROM calibration_session_stats ORDER BY session`
  );
  return result.rows;
};

/**
 * Get per-trial peak Δg from calibration_trial_peaks view
 */
export const getTrialPeaks = async (session?: string) => {
  let query;
  if (session) {
    const pattern = `${session}%`;
    query = sql`SELECT * FROM calibration_trial_peaks WHERE session LIKE ${pattern} ORDER BY session, trial`;
  } else {
    query = sql`SELECT * FROM calibration_trial_peaks ORDER BY session, trial`;
  }
  const result = await db.execute(query);
  return result.rows;
};

/**
 * Get per-session peak summary from calibration_peak_summary view
 */
export const getPeakSummary = async () => {
  const result = await db.execute(
    sql`SELECT * FROM calibration_peak_summary ORDER BY session`
  );
  return result.rows;
};
