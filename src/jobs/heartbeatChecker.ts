import cron from 'node-cron';
import { db } from '../db/drizzle';
import { devices } from '../db/schema';
import { and, eq, lt } from 'drizzle-orm';

// Devices that send data every 15s (lingkungan) or periodic heartbeats (intrusi)
// should be considered offline after 2 minutes without any signal.
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

const checkHeartbeats = async () => {
  console.log('[Cron Job] Running heartbeat check...');

  const cutoffTime = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

  try {
    const result = await db
      .update(devices)
      .set({ status: 'Offline' })
      .where(
        and(
          eq(devices.status, 'Online'),
          lt(devices.last_heartbeat, cutoffTime)
        )
      )
      .returning({ id: devices.id });

    if (result.length > 0) {
      console.log(`[Cron Job] Marked ${result.length} device(s) as Offline.`);
    }
  } catch (error) {
    console.error('[Cron Job] Error checking heartbeats:', error);
  }
};

export const startHeartbeatJob = () => {
  const task = cron.schedule('*/1 * * * *', checkHeartbeats);
  console.log('[Cron Job] Heartbeat checker scheduled to run every minute.');
  return task;
};
