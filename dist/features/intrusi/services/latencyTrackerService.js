"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupLatencyRowsByRunId = exports.getLatencyRowsByRunId = exports.recordLatencyStage = exports.isLatencyTrace = void 0;
const drizzle_1 = require("../../../db/drizzle");
const LATENCY_TABLE = 'intrusi_latency_trace';
let tableReady = false;
let tableInitPromise = null;
const isLatencyTrace = (traceId) => typeof traceId === 'string' && traceId.startsWith('lt-');
exports.isLatencyTrace = isLatencyTrace;
const toNullableMs = (value) => {
    if (value === undefined || value === null)
        return null;
    if (!Number.isFinite(value))
        return null;
    return Math.round(value);
};
const ensureLatencyTable = async () => {
    if (tableReady)
        return;
    if (tableInitPromise)
        return tableInitPromise;
    tableInitPromise = (async () => {
        await drizzle_1.pool.query(`
      CREATE TABLE IF NOT EXISTS ${LATENCY_TABLE} (
        trace_id TEXT PRIMARY KEY,
        run_id TEXT,
        scenario TEXT,
        device_id UUID,
        event_type TEXT,
        t0_publish_ms BIGINT,
        device_ms BIGINT,
        t1_mqtt_rx_ms BIGINT,
        t2_db_insert_ms BIGINT,
        t3_alert_decision_ms BIGINT,
        t4_notify_dispatch_ms BIGINT,
        t5_telegram_api_ack_ms BIGINT,
        cooldown_suppressed BOOLEAN,
        telegram_sent BOOLEAN,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
        await drizzle_1.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intrusi_latency_trace_run_id
      ON ${LATENCY_TABLE} (run_id)
    `);
        await drizzle_1.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intrusi_latency_trace_created_at
      ON ${LATENCY_TABLE} (created_at DESC)
    `);
        tableReady = true;
        tableInitPromise = null;
    })().catch((error) => {
        tableInitPromise = null;
        throw error;
    });
    return tableInitPromise;
};
const recordLatencyStage = async (update) => {
    if (!(0, exports.isLatencyTrace)(update.traceId))
        return;
    try {
        await ensureLatencyTable();
        await drizzle_1.pool.query(`
      INSERT INTO ${LATENCY_TABLE} (
        trace_id,
        run_id,
        scenario,
        device_id,
        event_type,
        t0_publish_ms,
        device_ms,
        t1_mqtt_rx_ms,
        t2_db_insert_ms,
        t3_alert_decision_ms,
        t4_notify_dispatch_ms,
        t5_telegram_api_ack_ms,
        cooldown_suppressed,
        telegram_sent,
        error,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        NOW()
      )
      ON CONFLICT (trace_id)
      DO UPDATE SET
        run_id = COALESCE(EXCLUDED.run_id, ${LATENCY_TABLE}.run_id),
        scenario = COALESCE(EXCLUDED.scenario, ${LATENCY_TABLE}.scenario),
        device_id = COALESCE(EXCLUDED.device_id, ${LATENCY_TABLE}.device_id),
        event_type = COALESCE(EXCLUDED.event_type, ${LATENCY_TABLE}.event_type),
        t0_publish_ms = COALESCE(EXCLUDED.t0_publish_ms, ${LATENCY_TABLE}.t0_publish_ms),
        device_ms = COALESCE(EXCLUDED.device_ms, ${LATENCY_TABLE}.device_ms),
        t1_mqtt_rx_ms = COALESCE(EXCLUDED.t1_mqtt_rx_ms, ${LATENCY_TABLE}.t1_mqtt_rx_ms),
        t2_db_insert_ms = COALESCE(EXCLUDED.t2_db_insert_ms, ${LATENCY_TABLE}.t2_db_insert_ms),
        t3_alert_decision_ms = COALESCE(EXCLUDED.t3_alert_decision_ms, ${LATENCY_TABLE}.t3_alert_decision_ms),
        t4_notify_dispatch_ms = COALESCE(EXCLUDED.t4_notify_dispatch_ms, ${LATENCY_TABLE}.t4_notify_dispatch_ms),
        t5_telegram_api_ack_ms = COALESCE(EXCLUDED.t5_telegram_api_ack_ms, ${LATENCY_TABLE}.t5_telegram_api_ack_ms),
        cooldown_suppressed = COALESCE(EXCLUDED.cooldown_suppressed, ${LATENCY_TABLE}.cooldown_suppressed),
        telegram_sent = COALESCE(EXCLUDED.telegram_sent, ${LATENCY_TABLE}.telegram_sent),
        error = COALESCE(EXCLUDED.error, ${LATENCY_TABLE}.error),
        updated_at = NOW()
      `, [
            update.traceId,
            update.runId ?? null,
            update.scenario ?? null,
            update.deviceId ?? null,
            update.eventType ?? null,
            toNullableMs(update.t0PublishMs),
            toNullableMs(update.deviceMs),
            toNullableMs(update.t1MqttRxMs),
            toNullableMs(update.t2DbInsertMs),
            toNullableMs(update.t3AlertDecisionMs),
            toNullableMs(update.t4NotifyDispatchMs),
            toNullableMs(update.t5TelegramApiAckMs),
            update.cooldownSuppressed ?? null,
            update.telegramSent ?? null,
            update.error ?? null
        ]);
    }
    catch (error) {
        console.error('[LatencyTracker] Failed to record stage:', error);
    }
};
exports.recordLatencyStage = recordLatencyStage;
const getLatencyRowsByRunId = async (runId) => {
    await ensureLatencyTable();
    const result = await drizzle_1.pool.query(`
    SELECT *
    FROM ${LATENCY_TABLE}
    WHERE run_id = $1
    ORDER BY created_at ASC
    `, [runId]);
    return result.rows;
};
exports.getLatencyRowsByRunId = getLatencyRowsByRunId;
const cleanupLatencyRowsByRunId = async (runId) => {
    await ensureLatencyTable();
    await drizzle_1.pool.query(`DELETE FROM ${LATENCY_TABLE} WHERE run_id = $1`, [runId]);
};
exports.cleanupLatencyRowsByRunId = cleanupLatencyRowsByRunId;
