import mqtt from 'mqtt';
import { promises as fs } from 'fs';
import path from 'path';
import { env } from '../../src/config/env';
import { pool } from '../../src/db/drizzle';
import {
  cleanupLatencyRowsByRunId,
  getLatencyRowsByRunId,
  type LatencyTraceRow
} from '../../src/features/intrusi/services/latencyTrackerService';

type TestScenario =
  | 'intrusi_alarm'
  | 'battery_critical'
  | 'power_to_battery'
  | 'power_to_mains'
  | 'mixed';

type TriggerMode = 'device_command' | 'direct_mqtt';

interface CliOptions {
  runId: string;
  scenario: TestScenario;
  triggerMode: TriggerMode;
  count: number;
  intervalMs: number;
  settleMs: number;
  timeoutMs: number;
  slaP95Ms: number;
  deviceId?: string;
  outputDir: string;
  cleanupBefore: boolean;
}

interface DeviceContext {
  deviceId: string;
  deviceName: string;
  areaId: string;
  areaName: string;
  warehouseId: string;
  warehouseName: string;
}

interface TraceLatency {
  traceId: string;
  scenario: string;
  eventType: string;
  cooldownSuppressed: boolean;
  telegramSent: boolean;
  error: string | null;
  t0PublishMs: number | null;
  deviceMs: number | null;
  t1MqttRxMs: number | null;
  t2DbInsertMs: number | null;
  t3AlertDecisionMs: number | null;
  t4NotifyDispatchMs: number | null;
  t5TelegramAckMs: number | null;
  publishToMqttMs: number | null;
  mqttToDbMs: number | null;
  mqttToAlertDecisionMs: number | null;
  alertDecisionToDispatchMs: number | null;
  dispatchToTelegramAckMs: number | null;
  e2ePublishToTelegramMs: number | null;
  e2eDeviceToTelegramMs: number | null;
}

const DEFAULT_SCENARIO: TestScenario = 'mixed';
const SCENARIO_CYCLE: TestScenario[] = [
  'intrusi_alarm',
  'battery_critical',
  'power_to_battery',
  'power_to_mains'
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toMs = (value: string | null): number | null => {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const duration = (start: number | null, end: number | null): number | null => {
  if (start === null || end === null) return null;
  const diff = end - start;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
};

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);

  if (lower === upper) return sorted[lower];

  const fraction = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
};

const formatMs = (value: number | null): string =>
  value === null ? '-' : value.toFixed(1);

const parseCliArgs = (): CliOptions => {
  const raw = process.argv.slice(2);
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < raw.length; i++) {
    const token = raw[i];
    if (!token.startsWith('--')) continue;

    const noPrefix = token.slice(2);
    const equalsIndex = noPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      const key = noPrefix.slice(0, equalsIndex);
      const value = noPrefix.slice(equalsIndex + 1);
      parsed[key] = value;
      continue;
    }

    const next = raw[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[noPrefix] = next;
      i += 1;
    } else {
      parsed[noPrefix] = true;
    }
  }

  const count = Number(parsed.count ?? 30);
  const intervalMs = Number(parsed['interval-ms'] ?? 1200);
  const settleMs = Number(parsed['settle-ms'] ?? 9000);
  const timeoutMs = Number(parsed['timeout-ms'] ?? 120000);
  const slaP95Ms = Number(parsed['sla-p95-ms'] ?? 3000);
  const scenarioRaw = String(parsed.scenario ?? DEFAULT_SCENARIO);
  const triggerModeRaw = String(parsed['trigger-mode'] ?? 'device_command');
  const scenario =
    scenarioRaw === 'intrusi_alarm' ||
    scenarioRaw === 'battery_critical' ||
    scenarioRaw === 'power_to_battery' ||
    scenarioRaw === 'power_to_mains' ||
    scenarioRaw === 'mixed'
      ? scenarioRaw
      : DEFAULT_SCENARIO;
  const triggerMode: TriggerMode =
    triggerModeRaw === 'direct_mqtt' ? 'direct_mqtt' : 'device_command';

  return {
    runId: String(parsed['run-id'] ?? `lt-run-${Date.now()}`),
    scenario,
    triggerMode,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 30,
    intervalMs:
      Number.isFinite(intervalMs) && intervalMs >= 100
        ? Math.floor(intervalMs)
        : 1200,
    settleMs:
      Number.isFinite(settleMs) && settleMs >= 1000 ? Math.floor(settleMs) : 9000,
    timeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs >= 5000
        ? Math.floor(timeoutMs)
        : 120000,
    slaP95Ms:
      Number.isFinite(slaP95Ms) && slaP95Ms > 0 ? Math.floor(slaP95Ms) : 3000,
    deviceId:
      typeof parsed['device-id'] === 'string'
        ? String(parsed['device-id'])
        : undefined,
    outputDir: String(
      parsed['output-dir'] ?? path.join('tests', 'latency', 'reports')
    ),
    cleanupBefore:
      parsed['cleanup-before'] === true || parsed['cleanup-before'] === 'true'
  };
};

const resolveDeviceContext = async (deviceId?: string): Promise<DeviceContext> => {
  const baseQuery = `
    SELECT
      d.id AS device_id,
      d.name AS device_name,
      a.id AS area_id,
      a.name AS area_name,
      w.id AS warehouse_id,
      w.name AS warehouse_name
    FROM devices d
    JOIN areas a ON a.id = d.area_id
    JOIN warehouses w ON w.id = a.warehouse_id
    WHERE d.system_type = 'intrusi'
  `;

  const withFilter = deviceId
    ? `${baseQuery} AND d.id = $1 ORDER BY d.updated_at DESC LIMIT 1`
    : `${baseQuery} ORDER BY d.updated_at DESC LIMIT 1`;

  const result = deviceId
    ? await pool.query(withFilter, [deviceId])
    : await pool.query(withFilter);

  if (result.rowCount === 0) {
    throw new Error(
      deviceId
        ? `Device intrusi ${deviceId} tidak ditemukan.`
        : 'Tidak ada device intrusi ditemukan di database.'
    );
  }

  const row = result.rows[0];
  return {
    deviceId: String(row.device_id),
    deviceName: String(row.device_name),
    areaId: String(row.area_id),
    areaName: String(row.area_name),
    warehouseId: String(row.warehouse_id),
    warehouseName: String(row.warehouse_name)
  };
};

const connectMqtt = async (): Promise<mqtt.MqttClient> => {
  const mqttUrl = `mqtts://${env.MQTT_HOST}:8883`;
  const client = mqtt.connect(mqttUrl, {
    clientId: `intrusi-latency-harness-${Date.now()}`,
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 2000,
    connectTimeout: 20000,
    keepalive: 30
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error('Timeout MQTT connect.'));
    }, 25000);

    client.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    client.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return client;
};

const publishJson = async (
  client: mqtt.MqttClient,
  topic: string,
  payload: Record<string, unknown>
) => {
  await new Promise<void>((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const buildTracePayload = (
  traceId: string,
  runId: string,
  scenario: TestScenario,
  seq: number
) => ({
  trace_id: traceId,
  test_run_id: runId,
  test_scenario: scenario,
  test_bypass_cooldown: true,
  seq,
  publish_ms: Date.now(),
  device_ms: Date.now()
});

const sendPrimingStatus = async (
  client: mqtt.MqttClient,
  statusTopic: string,
  power: 'MAINS' | 'BATTERY'
) => {
  await publishJson(client, statusTopic, {
    state: 'ARMED',
    door: 'CLOSED',
    siren: 'OFF',
    power,
    vbat_v: power === 'BATTERY' ? 3.35 : 4.12,
    vbat_pct: power === 'BATTERY' ? 22 : 100
  });
};

const runOneScenario = async (
  client: mqtt.MqttClient,
  baseTopic: string,
  scenario: TestScenario,
  triggerMode: TriggerMode,
  traceId: string,
  runId: string,
  seq: number
) => {
  const sensorTopic = `${baseTopic}/sensors/intrusi`;
  const statusTopic = `${baseTopic}/status`;
  const commandTopic = `${baseTopic}/commands`;
  const trace = buildTracePayload(traceId, runId, scenario, seq);

  if (triggerMode === 'device_command') {
    if (scenario === 'intrusi_alarm') {
      await publishJson(client, commandTopic, {
        cmd: 'TEST_FORCED_ENTRY',
        ...trace,
        peak_delta_g: Number((1.2 + Math.random() * 0.5).toFixed(3)),
        anomaly_count: 3
      });
      return;
    }

    if (scenario === 'battery_critical') {
      await publishJson(client, commandTopic, {
        cmd: 'TEST_BATTERY_CRITICAL',
        ...trace,
        vbat_v: Number((3.15 + Math.random() * 0.08).toFixed(2)),
        vbat_pct: 6 + (seq % 3)
      });
      return;
    }

    if (scenario === 'power_to_battery') {
      await publishJson(client, commandTopic, {
        cmd: 'TEST_POWER_TO_BATTERY',
        ...trace,
        vbat_v: Number((3.25 + Math.random() * 0.1).toFixed(2)),
        vbat_pct: 14 + (seq % 5)
      });
      return;
    }

    if (scenario === 'power_to_mains') {
      await publishJson(client, commandTopic, {
        cmd: 'TEST_POWER_TO_MAINS',
        ...trace,
        vbat_v: 4.18,
        vbat_pct: 100
      });
      return;
    }
  }

  if (scenario === 'intrusi_alarm') {
    await publishJson(client, sensorTopic, {
      ...trace,
      type: 'FORCED_ENTRY_ALARM',
      state: 'ARMED',
      door: 'CLOSED',
      peak_delta_g: Number((1.2 + Math.random() * 0.5).toFixed(3)),
      anomaly_count: 3,
      window_threshold: 3,
      window_s: 45
    });
    return;
  }

  if (scenario === 'battery_critical') {
    await publishJson(client, statusTopic, {
      ...trace,
      state: 'ARMED',
      door: 'CLOSED',
      siren: 'OFF',
      power: 'BATTERY',
      vbat_v: Number((3.15 + Math.random() * 0.08).toFixed(2)),
      vbat_pct: 6 + (seq % 3)
    });
    return;
  }

  if (scenario === 'power_to_battery') {
    await sendPrimingStatus(client, statusTopic, 'MAINS');
    await sleep(150);
    await publishJson(client, statusTopic, {
      ...trace,
      state: 'ARMED',
      door: 'CLOSED',
      siren: 'OFF',
      power: 'BATTERY',
      vbat_v: Number((3.25 + Math.random() * 0.1).toFixed(2)),
      vbat_pct: 14 + (seq % 5)
    });
    return;
  }

  if (scenario === 'power_to_mains') {
    await sendPrimingStatus(client, statusTopic, 'BATTERY');
    await sleep(150);
    await publishJson(client, statusTopic, {
      ...trace,
      state: 'ARMED',
      door: 'CLOSED',
      siren: 'OFF',
      power: 'MAINS',
      vbat_v: 4.18,
      vbat_pct: 100
    });
    return;
  }

  throw new Error(`Scenario tidak dikenali: ${scenario}`);
};

const waitForRows = async (
  runId: string,
  expectedCount: number,
  timeoutMs: number
): Promise<LatencyTraceRow[]> => {
  const startedAt = Date.now();
  let latestRows: LatencyTraceRow[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    latestRows = await getLatencyRowsByRunId(runId);
    const completedCount = latestRows.filter(
      (row) => row.t5_telegram_api_ack_ms !== null || row.error !== null
    ).length;

    process.stdout.write(
      `\r[Harness] Trace rows: ${latestRows.length}/${expectedCount}, completed: ${completedCount}/${expectedCount}`
    );

    if (latestRows.length >= expectedCount && completedCount >= expectedCount) {
      process.stdout.write('\n');
      return latestRows;
    }

    await sleep(2000);
  }

  process.stdout.write('\n');
  return latestRows;
};

const buildLatencyRows = (
  expectedTraceIds: string[],
  dbRows: LatencyTraceRow[]
): TraceLatency[] => {
  const byTraceId = new Map(dbRows.map((row) => [row.trace_id, row]));

  return expectedTraceIds.map((traceId) => {
    const row = byTraceId.get(traceId);
    if (!row) {
      return {
        traceId,
        scenario: 'unknown',
        eventType: 'unknown',
        cooldownSuppressed: false,
        telegramSent: false,
        error: 'missing_trace_row',
        t0PublishMs: null,
        deviceMs: null,
        t1MqttRxMs: null,
        t2DbInsertMs: null,
        t3AlertDecisionMs: null,
        t4NotifyDispatchMs: null,
        t5TelegramAckMs: null,
        publishToMqttMs: null,
        mqttToDbMs: null,
        mqttToAlertDecisionMs: null,
        alertDecisionToDispatchMs: null,
        dispatchToTelegramAckMs: null,
        e2ePublishToTelegramMs: null,
        e2eDeviceToTelegramMs: null
      };
    }

    const t0PublishMs = toMs(row.t0_publish_ms);
    const deviceMs = toMs(row.device_ms);
    const t1MqttRxMs = toMs(row.t1_mqtt_rx_ms);
    const t2DbInsertMs = toMs(row.t2_db_insert_ms);
    const t3AlertDecisionMs = toMs(row.t3_alert_decision_ms);
    const t4NotifyDispatchMs = toMs(row.t4_notify_dispatch_ms);
    const t5TelegramAckMs = toMs(row.t5_telegram_api_ack_ms);

    return {
      traceId,
      scenario: row.scenario ?? 'unknown',
      eventType: row.event_type ?? 'unknown',
      cooldownSuppressed: row.cooldown_suppressed === true,
      telegramSent: row.telegram_sent === true,
      error: row.error,
      t0PublishMs,
      deviceMs,
      t1MqttRxMs,
      t2DbInsertMs,
      t3AlertDecisionMs,
      t4NotifyDispatchMs,
      t5TelegramAckMs,
      publishToMqttMs: duration(t0PublishMs, t1MqttRxMs),
      mqttToDbMs: duration(t1MqttRxMs, t2DbInsertMs),
      mqttToAlertDecisionMs: duration(t1MqttRxMs, t3AlertDecisionMs),
      alertDecisionToDispatchMs: duration(t3AlertDecisionMs, t4NotifyDispatchMs),
      dispatchToTelegramAckMs: duration(t4NotifyDispatchMs, t5TelegramAckMs),
      e2ePublishToTelegramMs: duration(t0PublishMs, t5TelegramAckMs),
      e2eDeviceToTelegramMs: duration(deviceMs, t5TelegramAckMs)
    };
  });
};

const buildMetricSummary = (rows: TraceLatency[]) => {
  const metricExtractors: Array<{
    key: string;
    label: string;
    extract: (row: TraceLatency) => number | null;
  }> = [
    {
      key: 'publish_to_mqtt_ms',
      label: 'Publish -> MQTT RX',
      extract: (row) => row.publishToMqttMs
    },
    {
      key: 'mqtt_to_db_ms',
      label: 'MQTT RX -> DB Insert',
      extract: (row) => row.mqttToDbMs
    },
    {
      key: 'mqtt_to_alert_decision_ms',
      label: 'MQTT RX -> Alert Decision',
      extract: (row) => row.mqttToAlertDecisionMs
    },
    {
      key: 'alert_decision_to_dispatch_ms',
      label: 'Alert Decision -> Dispatch',
      extract: (row) => row.alertDecisionToDispatchMs
    },
    {
      key: 'dispatch_to_telegram_ack_ms',
      label: 'Dispatch -> Telegram ACK',
      extract: (row) => row.dispatchToTelegramAckMs
    },
    {
      key: 'e2e_publish_to_telegram_ms',
      label: 'E2E Publish -> Telegram ACK',
      extract: (row) => row.e2ePublishToTelegramMs
    },
    {
      key: 'e2e_device_to_telegram_ms',
      label: 'E2E Device -> Telegram ACK',
      extract: (row) => row.e2eDeviceToTelegramMs
    }
  ];

  return metricExtractors.map((metric) => {
    const values = rows
      .map(metric.extract)
      .filter((value): value is number => value !== null);

    return {
      key: metric.key,
      label: metric.label,
      samples: values.length,
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      p99: percentile(values, 99)
    };
  });
};

const toCsv = (rows: TraceLatency[]): string => {
  const headers = [
    'trace_id',
    'scenario',
    'event_type',
    'cooldown_suppressed',
    'telegram_sent',
    'error',
    't0_publish_ms',
    'device_ms',
    't1_mqtt_rx_ms',
    't2_db_insert_ms',
    't3_alert_decision_ms',
    't4_notify_dispatch_ms',
    't5_telegram_ack_ms',
    'publish_to_mqtt_ms',
    'mqtt_to_db_ms',
    'mqtt_to_alert_decision_ms',
    'alert_decision_to_dispatch_ms',
    'dispatch_to_telegram_ack_ms',
    'e2e_publish_to_telegram_ms',
    'e2e_device_to_telegram_ms'
  ];

  const lines = rows.map((row) => {
    const values = [
      row.traceId,
      row.scenario,
      row.eventType,
      String(row.cooldownSuppressed),
      String(row.telegramSent),
      row.error ?? '',
      row.t0PublishMs,
      row.deviceMs,
      row.t1MqttRxMs,
      row.t2DbInsertMs,
      row.t3AlertDecisionMs,
      row.t4NotifyDispatchMs,
      row.t5TelegramAckMs,
      row.publishToMqttMs,
      row.mqttToDbMs,
      row.mqttToAlertDecisionMs,
      row.alertDecisionToDispatchMs,
      row.dispatchToTelegramAckMs,
      row.e2ePublishToTelegramMs,
      row.e2eDeviceToTelegramMs
    ].map((v) => (v === null || v === undefined ? '' : String(v)));

    return values
      .map((value) => {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replaceAll('"', '""')}"`;
        }
        return value;
      })
      .join(',');
  });

  return `${headers.join(',')}\n${lines.join('\n')}\n`;
};

const buildMarkdownSummary = (params: {
  options: CliOptions;
  device: DeviceContext;
  rows: TraceLatency[];
  metrics: ReturnType<typeof buildMetricSummary>;
  reportDir: string;
}) => {
  const { options, device, rows, metrics, reportDir } = params;
  const deliveredCount = rows.filter((row) => row.telegramSent).length;
  const suppressedCount = rows.filter((row) => row.cooldownSuppressed).length;
  const errorCount = rows.filter((row) => row.error && row.error.length > 0).length;

  const e2e = metrics.find((metric) => metric.key === 'e2e_publish_to_telegram_ms');
  const slaPass = !!e2e?.p95 && e2e.p95 <= options.slaP95Ms;

  const metricTable = metrics
    .map(
      (metric) =>
        `| ${metric.label} | ${metric.samples} | ${formatMs(metric.p50)} | ${formatMs(metric.p95)} | ${formatMs(metric.p99)} |`
    )
    .join('\n');

  const failedRows = rows
    .filter((row) => row.error)
    .slice(0, 30)
    .map((row) => `- ${row.traceId}: ${row.error}`)
    .join('\n');

  return `# Ringkasan Uji Latensi Intrusi\n\n- Run ID: ${options.runId}\n- Device: ${device.deviceName} (${device.deviceId})\n- Lokasi: ${device.warehouseName} / ${device.areaName}\n- Scenario input: ${options.scenario}\n- Trigger mode: ${options.triggerMode}\n- Jumlah trace dikirim: ${options.count}\n- Jumlah trace terekam: ${rows.length}\n- Telegram terkirim: ${deliveredCount}\n- Cooldown suppressed: ${suppressedCount}\n- Trace error/missing: ${errorCount}\n- SLA target: p95 E2E Publish -> Telegram ACK <= ${options.slaP95Ms} ms\n- Hasil SLA: ${slaPass ? 'PASS' : 'FAIL'}\n\n## Percentile Metrik (ms)\n| Metrik | Samples | p50 | p95 | p99 |\n|---|---:|---:|---:|---:|\n${metricTable}\n\n## Error Trace (max 30)\n${failedRows || '- Tidak ada error trace.'}\n\n## Artefak\n- ${path.join(reportDir, 'latency_raw.csv')}\n- ${path.join(reportDir, 'summary.json')}\n- ${path.join(reportDir, 'summary.md')}\n`;
};

const main = async () => {
  const options = parseCliArgs();
  const device = await resolveDeviceContext(options.deviceId);

  if (options.cleanupBefore) {
    await cleanupLatencyRowsByRunId(options.runId);
  }

  const mqttClient = await connectMqtt();
  const baseTopic = `warehouses/${device.warehouseId}/areas/${device.areaId}/devices/${device.deviceId}`;

  const expectedTraceIds: string[] = [];

  console.log('[Harness] Mulai pengiriman trace...');
  console.log(
    `[Harness] runId=${options.runId} scenario=${options.scenario} triggerMode=${options.triggerMode} count=${options.count} intervalMs=${options.intervalMs}`
  );
  console.log(`[Harness] target device=${device.deviceId} (${device.deviceName})`);

  try {
    for (let i = 0; i < options.count; i++) {
      const scenario =
        options.scenario === 'mixed'
          ? SCENARIO_CYCLE[i % SCENARIO_CYCLE.length]
          : options.scenario;

      const traceId = `lt-${options.runId}-${String(i + 1).padStart(4, '0')}`;
      expectedTraceIds.push(traceId);

      await runOneScenario(
        mqttClient,
        baseTopic,
        scenario,
        options.triggerMode,
        traceId,
        options.runId,
        i + 1
      );

      process.stdout.write(
        `\r[Harness] Published ${i + 1}/${options.count} (${scenario})`
      );

      if (i < options.count - 1) {
        await sleep(options.intervalMs);
      }
    }

    process.stdout.write('\n');
    console.log(`[Harness] Menunggu settle ${options.settleMs} ms...`);
    await sleep(options.settleMs);

    const rowsFromDb = await waitForRows(
      options.runId,
      expectedTraceIds.length,
      options.timeoutMs
    );

    const rows = buildLatencyRows(expectedTraceIds, rowsFromDb);
    const metrics = buildMetricSummary(rows);

    const reportDir = path.join(process.cwd(), options.outputDir, options.runId);
    await fs.mkdir(reportDir, { recursive: true });

    const csv = toCsv(rows);
    const markdownSummary = buildMarkdownSummary({
      options,
      device,
      rows,
      metrics,
      reportDir
    });

    const jsonSummary = {
      runId: options.runId,
      scenario: options.scenario,
      triggerMode: options.triggerMode,
      countSent: options.count,
      countRecorded: rows.length,
      metrics,
      rows
    };

    await fs.writeFile(path.join(reportDir, 'latency_raw.csv'), csv, 'utf8');
    await fs.writeFile(
      path.join(reportDir, 'summary.md'),
      markdownSummary,
      'utf8'
    );
    await fs.writeFile(
      path.join(reportDir, 'summary.json'),
      JSON.stringify(jsonSummary, null, 2),
      'utf8'
    );

    const e2e = metrics.find((metric) => metric.key === 'e2e_publish_to_telegram_ms');
    const slaPass = !!e2e?.p95 && e2e.p95 <= options.slaP95Ms;

    console.log('\n[Harness] Selesai.');
    console.log(`[Harness] p95 E2E Publish -> Telegram ACK: ${formatMs(e2e?.p95 ?? null)} ms`);
    console.log(`[Harness] SLA (${options.slaP95Ms} ms): ${slaPass ? 'PASS' : 'FAIL'}`);
    console.log(`[Harness] Report dir: ${reportDir}`);
  } finally {
    mqttClient.end(true);
    await pool.end();
  }
};

main().catch(async (error) => {
  console.error('[Harness] Gagal:', error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
