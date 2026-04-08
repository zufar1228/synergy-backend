/**
 * Calibration Database View Validation Tests
 * Run: npx tsx tests/calibration/db-views.test.ts
 *
 * Connects directly to Supabase Postgres and validates:
 *   - All 3 tables exist with expected columns
 *   - All 4 views exist and return expected columns
 *   - NULL behavior for Session A in aggregate views
 */

import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let passed = 0;
let failed = 0;

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

function expect(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function getColumns(tableName: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [tableName]
  );
  return res.rows.map((r: any) => r.column_name);
}

async function tableExists(name: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
    [name]
  );
  return res.rows.length > 0;
}

async function viewExists(name: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM pg_views WHERE viewname = $1`, [
    name
  ]);
  return res.rows.length > 0;
}

// ===== TABLE VALIDATION =====

async function testTables() {
  console.log('\n--- Base Tables ---');

  await assert('calibration_raw table exists', async () => {
    expect(
      await tableExists('calibration_raw'),
      'Table calibration_raw not found'
    );
  });

  await assert(
    'calibration_raw has expected columns (no ts_human)',
    async () => {
      const cols = await getColumns('calibration_raw');
      const expected = [
        'id',
        'session',
        'trial',
        'ts_device',
        'ts_iso',
        'delta_g',
        'marker',
        'note',
        'device_id',
        'created_at'
      ];
      for (const c of expected) {
        expect(
          cols.includes(c),
          `Missing column: ${c}. Found: ${cols.join(', ')}`
        );
      }
      expect(
        !cols.includes('ts_human'),
        `Dead column ts_human should be removed. Found: ${cols.join(', ')}`
      );
    }
  );

  await assert(
    'calibration_summary table exists with expected columns',
    async () => {
      expect(
        await tableExists('calibration_summary'),
        'Table calibration_summary not found'
      );
      const cols = await getColumns('calibration_summary');
      for (const c of [
        'id',
        'session',
        'trial',
        'summary_type',
        'dg_min',
        'dg_max',
        'dg_mean',
        'n_samples',
        'window_ms',
        'device_id',
        'created_at'
      ]) {
        expect(
          cols.includes(c),
          `Missing column: ${c}. Found: ${cols.join(', ')}`
        );
      }
    }
  );

  await assert(
    'calibration_device_status table exists with expected columns',
    async () => {
      expect(
        await tableExists('calibration_device_status'),
        'Table calibration_device_status not found'
      );
      const cols = await getColumns('calibration_device_status');
      for (const c of [
        'id',
        'session',
        'recording',
        'trial',
        'uptime_sec',
        'wifi_rssi',
        'free_heap',
        'offline_buf',
        'door_state',
        'device_id',
        'created_at'
      ]) {
        expect(
          cols.includes(c),
          `Missing column: ${c}. Found: ${cols.join(', ')}`
        );
      }
    }
  );
}

// ===== VIEW VALIDATION =====

async function testViews() {
  console.log('\n--- Analytical Views ---');

  await assert('calibration_statistics view exists', async () => {
    expect(await viewExists('calibration_statistics'), 'View not found');
  });

  await assert('calibration_statistics returns expected columns', async () => {
    const res = await pool.query(
      'SELECT * FROM calibration_statistics LIMIT 0'
    );
    const cols = res.fields.map((f) => f.name);
    for (const c of [
      'session',
      'trial',
      'n_samples',
      'dg_min',
      'dg_max',
      'dg_mean',
      'dg_stddev'
    ]) {
      expect(
        cols.includes(c),
        `Missing column: ${c}. Found: ${cols.join(', ')}`
      );
    }
  });

  await assert('calibration_session_stats view exists', async () => {
    expect(await viewExists('calibration_session_stats'), 'View not found');
  });

  await assert(
    'calibration_session_stats returns expected columns',
    async () => {
      const res = await pool.query(
        'SELECT * FROM calibration_session_stats LIMIT 0'
      );
      const cols = res.fields.map((f) => f.name);
      for (const c of [
        'session',
        'total_samples',
        'n_trials',
        'dg_min',
        'dg_max',
        'dg_mean',
        'dg_stddev',
        'dg_median',
        'dg_p95',
        'dg_p99'
      ]) {
        expect(
          cols.includes(c),
          `Missing column: ${c}. Found: ${cols.join(', ')}`
        );
      }
    }
  );

  await assert('calibration_trial_peaks view exists', async () => {
    expect(await viewExists('calibration_trial_peaks'), 'View not found');
  });

  await assert('calibration_trial_peaks returns expected columns', async () => {
    const res = await pool.query(
      'SELECT * FROM calibration_trial_peaks LIMIT 0'
    );
    const cols = res.fields.map((f) => f.name);
    for (const c of ['session', 'trial', 'dg_peak', 'n_samples']) {
      expect(
        cols.includes(c),
        `Missing column: ${c}. Found: ${cols.join(', ')}`
      );
    }
  });

  await assert('calibration_peak_summary view exists', async () => {
    expect(await viewExists('calibration_peak_summary'), 'View not found');
  });

  await assert(
    'calibration_peak_summary returns expected columns',
    async () => {
      const res = await pool.query(
        'SELECT * FROM calibration_peak_summary LIMIT 0'
      );
      const cols = res.fields.map((f) => f.name);
      for (const c of [
        'session',
        'n_trials',
        'peak_min',
        'peak_max',
        'peak_mean',
        'peak_stddev'
      ]) {
        expect(
          cols.includes(c),
          `Missing column: ${c}. Found: ${cols.join(', ')}`
        );
      }
    }
  );
}

// ===== NULL BEHAVIOR =====

async function testNullBehavior() {
  console.log('\n--- NULL Behavior Validation ---');

  await assert(
    'calibration_statistics: Session A rows have null dg_stddev',
    async () => {
      const res = await pool.query(
        `SELECT * FROM calibration_statistics WHERE session = 'A' LIMIT 5`
      );
      for (const row of res.rows) {
        expect(
          row.dg_stddev === null,
          `Session A dg_stddev should be null, got ${row.dg_stddev}`
        );
      }
      // It's OK if no Session A data exists yet
    }
  );

  await assert(
    'calibration_session_stats: Session A has null stddev/median/p95/p99',
    async () => {
      const res = await pool.query(
        `SELECT * FROM calibration_session_stats WHERE session = 'A' LIMIT 1`
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        expect(
          row.dg_stddev === null,
          `Expected null dg_stddev, got ${row.dg_stddev}`
        );
        expect(
          row.dg_median === null,
          `Expected null dg_median, got ${row.dg_median}`
        );
        expect(row.dg_p95 === null, `Expected null dg_p95, got ${row.dg_p95}`);
        expect(row.dg_p99 === null, `Expected null dg_p99, got ${row.dg_p99}`);
      }
    }
  );

  await assert(
    'calibration_session_stats: Sessions B/C/D have non-null stddev/median/p95/p99',
    async () => {
      const res = await pool.query(
        `SELECT * FROM calibration_session_stats WHERE session IN ('B','C','D') LIMIT 5`
      );
      for (const row of res.rows) {
        expect(
          row.dg_stddev !== null,
          `Session ${row.session} dg_stddev should be non-null`
        );
        expect(
          row.dg_median !== null,
          `Session ${row.session} dg_median should be non-null`
        );
        expect(
          row.dg_p95 !== null,
          `Session ${row.session} dg_p95 should be non-null`
        );
        expect(
          row.dg_p99 !== null,
          `Session ${row.session} dg_p99 should be non-null`
        );
      }
    }
  );
}

// ===== DEVICE ID CONSISTENCY =====

async function testDeviceIdConsistency() {
  console.log('\n--- Device ID Consistency ---');

  await assert(
    'calibration_device_status uses consistent device_id format',
    async () => {
      const res = await pool.query(
        `SELECT DISTINCT device_id FROM calibration_device_status`
      );
      const ids = res.rows.map((r: any) => r.device_id);
      // After fix: should only have UUID format, not 'xiao-s3-01'
      for (const id of ids) {
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id
          );
        const isCalDevice = id === 'xiao-s3-01';
        expect(isUUID || isCalDevice, `Unexpected device_id format: ${id}`);
        if (isCalDevice) {
          console.log(
            '    ⚠️  Found legacy device_id "xiao-s3-01" — old data before migration'
          );
        }
      }
    }
  );

  await assert(
    'no duplicate device status rows per heartbeat cycle (last 2 minutes)',
    async () => {
      const res = await pool.query(`
      SELECT device_id, date_trunc('minute', created_at) AS minute, COUNT(*) AS cnt
      FROM calibration_device_status
      WHERE created_at > now() - interval '2 minutes'
      GROUP BY device_id, minute
      HAVING COUNT(*) > 4
    `);
      // Heartbeat fires every 15s — max 4 rows/min per device with single writer.
      // More than 4 means dual-write (backend MQTT + firmware REST) is still active.
      // Check last 2 minutes only (10 min would catch pre-fix historical rows).
      if (res.rows.length > 0) {
        console.log(
          `    ⚠️  Duplicate rows found — backend may still be running old code. Restart backend dev server.`
        );
      }
      expect(
        res.rows.length === 0,
        `Found ${res.rows.length} minutes with >4 status rows in last 2 min — dual-write may still be active. Restart backend.`
      );
    }
  );
}

// ===== ROW COUNTS =====

async function testRowCounts() {
  console.log('\n--- Row Counts ---');

  for (const table of [
    'calibration_raw',
    'calibration_summary',
    'calibration_device_status'
  ]) {
    await assert(`${table} row count`, async () => {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      console.log(`    📊 ${table}: ${res.rows[0].cnt} rows`);
    });
  }
}

// ===== MAIN =====

async function main() {
  console.log('\n🔧 Calibration DB View Validation Tests\n');

  await testTables();
  await testViews();
  await testNullBehavior();
  await testDeviceIdConsistency();
  await testRowCounts();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
