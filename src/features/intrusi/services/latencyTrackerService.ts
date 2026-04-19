/**
 * @file latencyTrackerService.ts
 * @purpose End-to-end latency measurement for intrusi event pipeline (testing/benchmarking)
 * @usedBy intrusiAlertingService, alertingService, mqtt/client
 * @deps db/drizzle (pool — raw SQL)
 * @exports LatencyStageUpdate, LatencyTraceRow, isLatencyTrace, recordLatencyStage, getLatencyRowsByRunId, cleanupLatencyRowsByRunId
 * @sideEffects DB read/write (latency_traces table)
 */

import { pool } from '../../../db/drizzle';

export interface LatencyStageUpdate {
  traceId?: string;
  runId?: string;
  scenario?: string;
  deviceId?: string;
  eventType?: string;
  t0PublishMs?: number;
  deviceMs?: number;
  t1MqttRxMs?: number;
  t2DbInsertMs?: number;
  t3AlertDecisionMs?: number;
  t4NotifyDispatchMs?: number;
  t5TelegramApiAckMs?: number;
  cooldownSuppressed?: boolean;
  telegramSent?: boolean;
  error?: string;
}

export interface LatencyTraceRow {
  trace_id: string;
  run_id: string | null;
  scenario: string | null;
  device_id: string | null;
  event_type: string | null;
  t0_publish_ms: string | null;
  device_ms: string | null;
  t1_mqtt_rx_ms: string | null;
  t2_db_insert_ms: string | null;
  t3_alert_decision_ms: string | null;
  t4_notify_dispatch_ms: string | null;
  t5_telegram_api_ack_ms: string | null;
  cooldown_suppressed: boolean | null;
  telegram_sent: boolean | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const LATENCY_TABLE = 'intrusi_latency_trace';
let tableReady = false;
let tableInitPromise: Promise<void> | null = null;

export const isLatencyTrace = (traceId?: string | null): boolean =>
  typeof traceId === 'string' && traceId.startsWith('lt-');

const toNullableMs = (value?: number): number | null => {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
};

const ensureLatencyTable = async () => {
  if (tableReady) return;
  if (tableInitPromise) return tableInitPromise;

  tableInitPromise = (async () => {
    await pool.query(`
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

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_intrusi_latency_trace_run_id
      ON ${LATENCY_TABLE} (run_id)
    `);

    await pool.query(`
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

export const recordLatencyStage = async (update: LatencyStageUpdate) => {
  if (!isLatencyTrace(update.traceId)) return;

  try {
    await ensureLatencyTable();

    await pool.query(
      `
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
      `,
      [
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
      ]
    );
  } catch (error) {
    console.error('[LatencyTracker] Failed to record stage:', error);
  }
};

export const getLatencyRowsByRunId = async (
  runId: string
): Promise<LatencyTraceRow[]> => {
  await ensureLatencyTable();
  const result = await pool.query<LatencyTraceRow>(
    `
    SELECT *
    FROM ${LATENCY_TABLE}
    WHERE run_id = $1
    ORDER BY created_at ASC
    `,
    [runId]
  );

  return result.rows;
};

export const cleanupLatencyRowsByRunId = async (runId: string) => {
  await ensureLatencyTable();
  await pool.query(`DELETE FROM ${LATENCY_TABLE} WHERE run_id = $1`, [runId]);
};
