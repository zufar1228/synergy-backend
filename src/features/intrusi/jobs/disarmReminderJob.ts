/**
 * @file disarmReminderJob.ts
 * @purpose Cron job — sends reminder if intrusi device DISARMED for >1 hour
 * @usedBy server.ts (startup)
 * @deps node-cron, db/drizzle, schema (devices, intrusi_logs), alertingService
 * @exports startDisarmReminderJob
 * @sideEffects DB read, Telegram + Web Push notifications, runs every 15min
 */

//
// Sends a reminder notification (Telegram + Web Push) if an intrusi device
// has been in the DISARMED state for more than 1 hour.

import cron from 'node-cron';
import { db } from '../../../db/drizzle';
import {
  devices,
  intrusi_logs,
  user_notification_preferences
} from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import * as telegramService from '../../../services/telegramService';
import * as webPushService from '../../../services/webPushService';
import { formatTimestampWIB } from '../../../utils/time';

// --- Configuration ---
const DISARM_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const REMINDER_COOLDOWN_MS = 60 * 60 * 1000; // Re-remind every 1 hour
const JOB_INTERVAL_CRON = '*/10 * * * *'; // Check every 10 minutes

interface DisarmTracker {
  firstSeenDisarmedAt: Date;
  lastReminderSentAt: Date | null;
}

const disarmTrackers: Map<string, DisarmTracker> = new Map();

/**
 * Send the disarm reminder via Telegram group + Web Push to intrusi subscribers.
 */
const sendDisarmReminder = async (device: any) => {
  const { area } = device;
  const { warehouse } = area;

  const timestamp = formatTimestampWIB();

  const telegramMessage = `
<b>PENGINGAT: SISTEM BELUM DIAKTIFKAN</b>

<b>Lokasi:</b> ${warehouse.name} - ${area.name}
<b>Device:</b> ${device.name}
<b>Status:</b> NON-AKTIF selama lebih dari 1 jam

<b>Waktu Cek:</b> ${timestamp}

<i>Harap segera AKTIFKAN sistem keamanan pintu gudang untuk perlindungan optimal.</i>
`.trim();

  try {
    await telegramService.sendGroupAlert(telegramMessage);
    console.log(
      `[DisarmReminder] Telegram reminder sent for device ${device.id}`
    );
  } catch (error) {
    console.error(
      `[DisarmReminder] Telegram send failed for ${device.id}:`,
      error
    );
  }

  // --- Web Push ---
  try {
    const subscriberPrefs =
      await db.query.user_notification_preferences.findMany({
        where: and(
          eq(user_notification_preferences.system_type, 'intrusi'),
          eq(user_notification_preferences.is_enabled, true)
        ),
        columns: { user_id: true }
      });
    const userIds = subscriberPrefs.map((p) => p.user_id);

    if (userIds.length > 0) {
      const pushPayload = {
        title: 'Sistem Keamanan Belum Aktif',
        body: `${device.name} di ${warehouse.name} - ${area.name} masih NON-AKTIF selama lebih dari 1 jam. Segera AKTIFKAN!`,
        url: '/dashboard'
      };

      await Promise.all(
        userIds.map((userId) =>
          webPushService.sendPushNotification(userId, pushPayload)
        )
      );
      console.log(
        `[DisarmReminder] Web push sent to ${userIds.length} subscriber(s) for device ${device.id}`
      );
    }
  } catch (error) {
    console.error(`[DisarmReminder] Web push failed for ${device.id}:`, error);
  }
};

/**
 * Main check: find DISARMED intrusi devices and send reminders when overdue.
 */
const checkDisarmedDevices = async () => {
  console.log('[DisarmReminder] Running disarm reminder check...');

  try {
    const allDevices = await db.query.devices.findMany({
      where: eq(devices.system_type, 'intrusi'),
      with: {
        area: {
          with: { warehouse: true }
        }
      }
    });

    const now = new Date();
    const activeDeviceIds = new Set<string>();

    for (const device of allDevices) {
      if (!device.area || !device.area.warehouse) continue;

      const isDisarmed =
        device.intrusi_system_state === 'DISARMED' ||
        device.intrusi_system_state === null;

      if (!isDisarmed) {
        disarmTrackers.delete(device.id);
        continue;
      }

      activeDeviceIds.add(device.id);

      let tracker = disarmTrackers.get(device.id);
      if (!tracker) {
        let firstSeenDisarmedAt = now;
        try {
          const lastDisarmLog = await db.query.intrusi_logs.findFirst({
            where: and(
              eq(intrusi_logs.device_id, device.id),
              eq(intrusi_logs.event_type, 'DISARM')
            ),
            orderBy: [desc(intrusi_logs.timestamp)]
          });
          if (lastDisarmLog?.timestamp) {
            firstSeenDisarmedAt = lastDisarmLog.timestamp;
            console.log(
              `[DisarmReminder] Seeding tracker for device ${device.id} (${device.name}) from last DISARM at ${firstSeenDisarmedAt.toISOString()}`
            );
          }
        } catch (err) {
          console.error(
            `[DisarmReminder] Failed to seed tracker from DB for ${device.id}, using now:`,
            err
          );
        }
        tracker = {
          firstSeenDisarmedAt,
          lastReminderSentAt: null
        };
        disarmTrackers.set(device.id, tracker);
        if (
          now.getTime() - firstSeenDisarmedAt.getTime() <
          DISARM_THRESHOLD_MS
        ) {
          console.log(
            `[DisarmReminder] Tracking started for device ${device.id} (${device.name})`
          );
          continue;
        }
      }

      const disarmedDurationMs =
        now.getTime() - tracker.firstSeenDisarmedAt.getTime();

      if (disarmedDurationMs < DISARM_THRESHOLD_MS) continue;

      if (
        tracker.lastReminderSentAt &&
        now.getTime() - tracker.lastReminderSentAt.getTime() <
          REMINDER_COOLDOWN_MS
      ) {
        continue;
      }

      console.log(
        `[DisarmReminder] Device ${device.name} (${device.id}) DISARMED for ${Math.round(disarmedDurationMs / 60000)} minutes — sending reminder.`
      );
      await sendDisarmReminder(device);
      tracker.lastReminderSentAt = now;
    }

    for (const trackedId of disarmTrackers.keys()) {
      if (!activeDeviceIds.has(trackedId)) {
        disarmTrackers.delete(trackedId);
      }
    }
  } catch (error) {
    console.error('[DisarmReminder] Error checking disarmed devices:', error);
  }
};

export const startDisarmReminderJob = () => {
  const task = cron.schedule(JOB_INTERVAL_CRON, checkDisarmedDevices);
  console.log(
    '[DisarmReminder] Disarm reminder job scheduled (every 10 minutes).'
  );
  return task;
};
