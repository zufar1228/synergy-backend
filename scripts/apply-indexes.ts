// scripts/apply-indexes.ts
// Applies only the new performance indexes to the existing database.
// Safe to run multiple times — uses IF NOT EXISTS.

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const indexes = [
  // devices: heartbeat checker queries by status + last_heartbeat
  `CREATE INDEX IF NOT EXISTS idx_devices_status_heartbeat
   ON devices (status, last_heartbeat)`,

  // lingkungan_logs: ML pipeline and chart queries by device_id + timestamp
  `CREATE INDEX IF NOT EXISTS idx_lingkungan_logs_device_ts
   ON lingkungan_logs (device_id, timestamp DESC)`,

  // prediction_results: chart queries by device_id + timestamp
  `CREATE INDEX IF NOT EXISTS idx_prediction_results_device_ts
   ON prediction_results (device_id, timestamp DESC)`,

  // intrusi_logs: log list and status queries by device_id + timestamp
  `CREATE INDEX IF NOT EXISTS idx_intrusi_logs_device_ts
   ON intrusi_logs (device_id, timestamp DESC)`,

  // intrusi_logs: status queries that filter by event_type
  `CREATE INDEX IF NOT EXISTS idx_intrusi_logs_device_event_ts
   ON intrusi_logs (device_id, event_type, timestamp DESC)`,

  // keamanan_logs: repeat detection queries by device_id + created_at
  `CREATE INDEX IF NOT EXISTS idx_keamanan_logs_device_created
   ON keamanan_logs (device_id, created_at DESC)`,

  // keamanan_logs: unprocessed detection scan by detected + status
  `CREATE INDEX IF NOT EXISTS idx_keamanan_logs_detected_status
   ON keamanan_logs (detected, status, notification_sent_at)`
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('Applying performance indexes...\n');
    for (const sql of indexes) {
      const name = sql.match(/idx_\w+/)?.[0] ?? 'unknown';
      try {
        await client.query(sql);
        console.log(`  ✅ ${name}`);
      } catch (err: any) {
        console.error(`  ❌ ${name}: ${err.message}`);
      }
    }
    console.log('\n✅ Done.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
