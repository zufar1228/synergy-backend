/**
 * Firmware Data Flow Smoke Test
 * Run: npx tsx tests/calibration/firmware-dataflow.test.ts
 *
 * Simulates what the ESP32 firmware does:
 *   1. POST raw samples to calibration_raw (via Supabase REST)
 *   2. POST summary data to calibration_summary (via Supabase REST)
 *   3. POST device status to calibration_device_status (via Supabase REST)
 *   4. Verify data appears in all 4 analytical views
 *   5. Clean up test data
 *
 * Prerequisites: DATABASE_URL and SUPABASE_URL + SUPABASE_ANON_KEY in .env
 */

import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_DEVICE = '__test-firmware-smoke__';
const TEST_SESSION = 'Z'; // Use session Z to avoid collision with real A/B/C/D data

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

async function supabasePost(table: string, body: any) {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not set in .env');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  return res.status;
}

// ===== SETUP: Insert test data (simulating firmware) =====

async function insertTestData() {
  console.log('\n--- Insert Test Data (simulating firmware) ---');

  // Raw samples (like Sessions B/C/D firmware flushRawBuffer)
  await assert('POST raw samples to Supabase REST', async () => {
    const samples = Array.from({ length: 10 }, (_, i) => ({
      session: TEST_SESSION,
      trial: 1,
      ts_device: 100000 + i * 10,
      ts_iso: new Date().toISOString(),
      delta_g: 0.01 + Math.random() * 0.5,
      device_id: TEST_DEVICE
    }));
    const status = await supabasePost('calibration_raw', samples);
    expect(status === 201, `Expected 201, got ${status}`);
  });

  // Summary (like Session A firmware publishSummary)
  await assert('POST summary data to Supabase REST', async () => {
    const status = await supabasePost('calibration_summary', {
      session: TEST_SESSION,
      trial: 1,
      summary_type: 'periodic',
      dg_min: 0.005,
      dg_max: 0.12,
      dg_mean: 0.045,
      n_samples: 500,
      window_ms: 5000,
      device_id: TEST_DEVICE
    });
    expect(status === 201, `Expected 201, got ${status}`);
  });

  // Device status (like firmware publishDeviceStatusToSupabase)
  await assert('POST device status to Supabase REST', async () => {
    const status = await supabasePost('calibration_device_status', {
      session: TEST_SESSION,
      recording: true,
      trial: 1,
      uptime_sec: 300,
      wifi_rssi: -55,
      free_heap: 120000,
      offline_buf: 3,
      door_state: 'CLOSED',
      device_id: TEST_DEVICE
    });
    expect(status === 201, `Expected 201, got ${status}`);
  });
}

// ===== VERIFY: Data appears in views =====

async function verifyViews() {
  console.log('\n--- Verify Data in Views ---');

  await assert('calibration_statistics shows test session', async () => {
    const res = await pool.query(
      `SELECT * FROM calibration_statistics WHERE session = $1`,
      [TEST_SESSION]
    );
    // Should have 2 rows: one from raw (B/C/D path), one from summary (A path)
    expect(
      res.rows.length >= 1,
      `Expected at least 1 row, got ${res.rows.length}`
    );
    const rawRow = res.rows.find((r: any) => r.dg_stddev !== null);
    if (rawRow) {
      expect(rawRow.n_samples > 0, 'n_samples should be > 0');
      expect(
        typeof rawRow.dg_min === 'string' || typeof rawRow.dg_min === 'number',
        'dg_min should be present'
      );
    }
  });

  await assert('calibration_session_stats shows test session', async () => {
    const res = await pool.query(
      `SELECT * FROM calibration_session_stats WHERE session = $1`,
      [TEST_SESSION]
    );
    expect(
      res.rows.length >= 1,
      `Expected at least 1 row, got ${res.rows.length}`
    );
  });

  await assert('calibration_trial_peaks shows test session', async () => {
    const res = await pool.query(
      `SELECT * FROM calibration_trial_peaks WHERE session = $1`,
      [TEST_SESSION]
    );
    expect(
      res.rows.length >= 1,
      `Expected at least 1 row, got ${res.rows.length}`
    );
    const row = res.rows[0];
    expect(row.dg_peak > 0, 'dg_peak should be > 0');
  });

  await assert('calibration_peak_summary shows test session', async () => {
    const res = await pool.query(
      `SELECT * FROM calibration_peak_summary WHERE session = $1`,
      [TEST_SESSION]
    );
    expect(
      res.rows.length >= 1,
      `Expected at least 1 row, got ${res.rows.length}`
    );
  });

  await assert('calibration_device_status has test device', async () => {
    const res = await pool.query(
      `SELECT * FROM calibration_device_status WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [TEST_DEVICE]
    );
    expect(res.rows.length === 1, `Expected 1 row, got ${res.rows.length}`);
    expect(
      res.rows[0].offline_buf === 3,
      `Expected offline_buf=3, got ${res.rows[0].offline_buf}`
    );
    expect(
      res.rows[0].door_state === 'CLOSED',
      `Expected door_state=CLOSED, got ${res.rows[0].door_state}`
    );
  });
}

// ===== CLEANUP =====

async function cleanup() {
  console.log('\n--- Cleanup Test Data ---');

  await assert('delete test raw data', async () => {
    const res = await pool.query(
      `DELETE FROM calibration_raw WHERE device_id = $1`,
      [TEST_DEVICE]
    );
    console.log(`    🗑️  Deleted ${res.rowCount} raw rows`);
  });

  await assert('delete test summary data', async () => {
    const res = await pool.query(
      `DELETE FROM calibration_summary WHERE device_id = $1`,
      [TEST_DEVICE]
    );
    console.log(`    🗑️  Deleted ${res.rowCount} summary rows`);
  });

  await assert('delete test device status', async () => {
    const res = await pool.query(
      `DELETE FROM calibration_device_status WHERE device_id = $1`,
      [TEST_DEVICE]
    );
    console.log(`    🗑️  Deleted ${res.rowCount} status rows`);
  });
}

// ===== MAIN =====

async function main() {
  console.log('\n🔧 Firmware Data Flow Smoke Test\n');

  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
  }

  try {
    await insertTestData();
    await verifyViews();
  } finally {
    await cleanup();
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
