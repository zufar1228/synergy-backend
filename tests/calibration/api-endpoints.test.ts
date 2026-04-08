/**
 * Calibration API Endpoint Tests
 * Run: npx tsx tests/calibration/api-endpoints.test.ts
 *
 * Prerequisites: Backend server running (pnpm dev)
 * Tests all 9 /api-cal/* endpoints for correct HTTP status and response shape.
 */

const BASE = process.env.API_URL || 'http://localhost:3001';
const CAL = `${BASE}/api-cal`;
const DEVICE_ID = '8e819e4a-9710-491f-9fbc-741892ae6195';

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

async function fetchJson(path: string, options?: RequestInit) {
  const res = await fetch(`${CAL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  return { status: res.status, body: await res.json() };
}

// ===== TESTS =====

async function testSendCommand() {
  console.log('\n--- POST /command ---');

  await assert('returns 400 if deviceId missing', async () => {
    const { status, body } = await fetchJson('/command', {
      method: 'POST',
      body: JSON.stringify({ cmd: 'STOP' })
    });
    expect(status === 400, `Expected 400, got ${status}`);
    expect(
      body.error?.includes('deviceId'),
      `Expected error about deviceId: ${body.error}`
    );
  });

  await assert('returns 400 if cmd missing', async () => {
    const { status, body } = await fetchJson('/command', {
      method: 'POST',
      body: JSON.stringify({ deviceId: DEVICE_ID })
    });
    expect(status === 400, `Expected 400, got ${status}`);
    expect(
      body.error?.includes('cmd'),
      `Expected error about cmd: ${body.error}`
    );
  });

  await assert('returns 200 for valid STOP command', async () => {
    const { status, body } = await fetchJson('/command', {
      method: 'POST',
      body: JSON.stringify({ deviceId: DEVICE_ID, cmd: 'STOP' })
    });
    expect(status === 200, `Expected 200, got ${status}`);
    expect(
      body.message?.includes('STOP'),
      `Expected success message: ${body.message}`
    );
  });
}

async function testGetStatus() {
  console.log('\n--- GET /status/:deviceId ---');

  await assert('returns 200 with data field', async () => {
    const { status, body } = await fetchJson(`/status/${DEVICE_ID}`);
    expect(status === 200, `Expected 200, got ${status}`);
    expect('data' in body, 'Response should have data field');
  });

  await assert('returns 200 with null for unknown device', async () => {
    const { status, body } = await fetchJson('/status/nonexistent-device-id');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(
      body.data === null || body.data === undefined,
      'Expected null/undefined for unknown device'
    );
  });
}

async function testGetSessions() {
  console.log('\n--- GET /sessions ---');

  await assert('returns 200 with data array', async () => {
    const { status, body } = await fetchJson('/sessions');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
  });
}

async function testGetData() {
  console.log('\n--- GET /data ---');

  await assert('returns 200 with data array and pagination', async () => {
    const { status, body } = await fetchJson('/data?limit=5');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
    expect('pagination' in body, 'Response should have pagination');
    expect(
      typeof body.pagination.total === 'number',
      'pagination.total should be number'
    );
  });
}

async function testGetDataBySession() {
  console.log('\n--- GET /data/:session ---');

  await assert('returns 200 filtered by session B', async () => {
    const { status, body } = await fetchJson('/data/B?limit=5');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
    // If data exists, all rows should be session B
    for (const row of body.data) {
      expect(
        row.session?.startsWith('B'),
        `Expected session B*, got ${row.session}`
      );
    }
  });

  await assert('returns 200 with trial filter', async () => {
    const { status, body } = await fetchJson('/data/B?trial=1&limit=5');
    expect(status === 200, `Expected 200, got ${status}`);
    for (const row of body.data) {
      expect(row.trial === 1, `Expected trial 1, got ${row.trial}`);
    }
  });
}

async function testGetSummary() {
  console.log('\n--- GET /summary ---');

  await assert('returns 200 with data and pagination', async () => {
    const { status, body } = await fetchJson('/summary?limit=5');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
    expect('pagination' in body, 'Response should have pagination');
  });

  await assert('summary rows have expected columns', async () => {
    const { body } = await fetchJson('/summary?limit=1');
    if (body.data.length > 0) {
      const row = body.data[0];
      for (const col of [
        'session',
        'trial',
        'summary_type',
        'dg_min',
        'dg_max',
        'dg_mean',
        'n_samples'
      ]) {
        expect(col in row, `Missing column: ${col}`);
      }
    }
  });
}

async function testGetStatistics() {
  console.log('\n--- GET /statistics ---');

  await assert('returns 200 with data array', async () => {
    const { status, body } = await fetchJson('/statistics');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
  });

  await assert('statistics rows have expected columns', async () => {
    const { body } = await fetchJson('/statistics');
    if (body.data.length > 0) {
      const row = body.data[0];
      for (const col of [
        'session',
        'trial',
        'n_samples',
        'dg_min',
        'dg_max',
        'dg_mean'
      ]) {
        expect(col in row, `Missing column: ${col}`);
      }
      // dg_stddev may be null for Session A
      expect('dg_stddev' in row, 'Missing column: dg_stddev');
    }
  });

  await assert('statistics session filter works', async () => {
    const { status, body } = await fetchJson('/statistics?session=B');
    expect(status === 200, `Expected 200, got ${status}`);
    for (const row of body.data) {
      expect(
        row.session?.startsWith('B'),
        `Expected session B*, got ${row.session}`
      );
    }
  });
}

async function testGetSessionStats() {
  console.log('\n--- GET /session-stats ---');

  await assert('returns 200 with data array', async () => {
    const { status, body } = await fetchJson('/session-stats');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
  });

  await assert(
    'session-stats rows have expected columns (including nullable)',
    async () => {
      const { body } = await fetchJson('/session-stats');
      if (body.data.length > 0) {
        const row = body.data[0];
        for (const col of [
          'session',
          'total_samples',
          'n_trials',
          'dg_min',
          'dg_max',
          'dg_mean'
        ]) {
          expect(col in row, `Missing column: ${col}`);
        }
        // These may be null for Session A (UNION ALL from calibration_summary)
        for (const col of ['dg_stddev', 'dg_median', 'dg_p95', 'dg_p99']) {
          expect(col in row, `Missing nullable column: ${col}`);
        }
      }
    }
  );

  await assert(
    'Session A stats have null for stddev/median/p95/p99',
    async () => {
      const { body } = await fetchJson('/session-stats');
      const sessionA = body.data.find((r: any) => r.session === 'A');
      if (sessionA) {
        // Session A comes from calibration_summary — these should be null
        expect(
          sessionA.dg_median === null,
          `Expected null dg_median for session A, got ${sessionA.dg_median}`
        );
        expect(
          sessionA.dg_p95 === null,
          `Expected null dg_p95 for session A, got ${sessionA.dg_p95}`
        );
        expect(
          sessionA.dg_p99 === null,
          `Expected null dg_p99 for session A, got ${sessionA.dg_p99}`
        );
      }
    }
  );
}

async function testGetTrialPeaks() {
  console.log('\n--- GET /trial-peaks ---');

  await assert('returns 200 with data array', async () => {
    const { status, body } = await fetchJson('/trial-peaks');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
  });

  await assert('trial-peaks rows have expected columns', async () => {
    const { body } = await fetchJson('/trial-peaks');
    if (body.data.length > 0) {
      const row = body.data[0];
      for (const col of ['session', 'trial', 'dg_peak', 'n_samples']) {
        expect(col in row, `Missing column: ${col}`);
      }
    }
  });

  await assert('trial-peaks session filter works', async () => {
    const { status, body } = await fetchJson('/trial-peaks?session=C');
    expect(status === 200, `Expected 200, got ${status}`);
    for (const row of body.data) {
      expect(
        row.session?.startsWith('C'),
        `Expected session C*, got ${row.session}`
      );
    }
  });
}

async function testGetPeakSummary() {
  console.log('\n--- GET /peak-summary ---');

  await assert('returns 200 with data array', async () => {
    const { status, body } = await fetchJson('/peak-summary');
    expect(status === 200, `Expected 200, got ${status}`);
    expect(Array.isArray(body.data), 'Response data should be array');
  });

  await assert('peak-summary rows have expected columns', async () => {
    const { body } = await fetchJson('/peak-summary');
    if (body.data.length > 0) {
      const row = body.data[0];
      for (const col of [
        'session',
        'n_trials',
        'peak_min',
        'peak_max',
        'peak_mean'
      ]) {
        expect(col in row, `Missing column: ${col}`);
      }
      // peak_stddev may be null if only 1 trial
      expect('peak_stddev' in row, 'Missing column: peak_stddev');
    }
  });
}

// ===== MAIN =====

async function main() {
  console.log(`\n🔧 Calibration API Test Suite — ${CAL}\n`);

  await testSendCommand();
  await testGetStatus();
  await testGetSessions();
  await testGetData();
  await testGetDataBySession();
  await testGetSummary();
  await testGetStatistics();
  await testGetSessionStats();
  await testGetTrialPeaks();
  await testGetPeakSummary();

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
