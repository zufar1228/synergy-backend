// backend/src/jobs/disarmReminderJob.ts
//
// Sends a reminder notification (Telegram + Web Push) if an intrusi device
// has been in the DISARMED state for more than 1 hour.
//
// How it works:
//   - Runs every 10 minutes via node-cron.
//   - Queries all intrusi devices whose intrusi_system_state = 'DISARMED'.
//   - Uses an in-memory map to track when each device was first seen DISARMED.
//   - Once the DISARMED duration exceeds 1 hour, a reminder is sent.
//   - After the reminder is sent, a cooldown prevents re-sending for another hour.
//   - If a device is later seen as ARMED (or no longer DISARMED), its tracking
//     state is cleared so the cycle restarts next time it's disarmed.

import cron from 'node-cron';
import {
  Device,
  Area,
  Warehouse,
  UserNotificationPreference
} from '../../../db/models';
import IntrusiLog from '../models/intrusiLog';
import * as telegramService from '../../../services/telegramService';
import * as webPushService from '../../../services/webPushService';
import { formatTimestampWIB } from '../../../utils/time';

// --- Configuration ---
const DISARM_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const REMINDER_COOLDOWN_MS = 60 * 60 * 1000; // Re-remind every 1 hour
const JOB_INTERVAL_CRON = '*/10 * * * *'; // Check every 10 minutes

// In-memory state per device
interface DisarmTracker {
  /** Timestamp when device was first observed as DISARMED */
  firstSeenDisarmedAt: Date;
  /** Timestamp of the last reminder sent (null = never sent) */
  lastReminderSentAt: Date | null;
}

const disarmTrackers: Map<string, DisarmTracker> = new Map();

// Type helper for eager-loaded device
interface DeviceWithRelations extends Device {
  area: Area & { warehouse: Warehouse };
}

/**
 * Send the disarm reminder via Telegram group + Web Push to intrusi subscribers.
 */
const sendDisarmReminder = async (device: DeviceWithRelations) => {
  const { area } = device;
  const { warehouse } = area;

  const timestamp = formatTimestampWIB();

  // --- Telegram ---
  const telegramMessage = `
⚠️ <b>PENGINGAT: SISTEM BELUM DIAKTIFKAN</b> ⚠️

📍 <b>Lokasi:</b> ${warehouse.name} - ${area.name}
🔧 <b>Device:</b> ${device.name}
🔓 <b>Status:</b> DISARMED selama lebih dari 1 jam

🕐 <b>Waktu Cek:</b> ${timestamp}

<i>Harap segera ARM-kan sistem keamanan pintu gudang untuk perlindungan optimal.</i>
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
    const subscriberPrefs = await UserNotificationPreference.findAll({
      where: { system_type: 'intrusi', is_enabled: true },
      attributes: ['user_id']
    });
    const userIds = subscriberPrefs.map((p) => p.user_id);

    if (userIds.length > 0) {
      const pushPayload = {
        title: '⚠️ Sistem Keamanan Belum Aktif',
        body: `${device.name} di ${warehouse.name} - ${area.name} masih DISARMED selama lebih dari 1 jam. Segera ARM-kan!`,
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
    // Fetch all intrusi-type devices with their area/warehouse relations
    const devices = (await Device.findAll({
      where: { system_type: 'intrusi' },
      include: [
        {
          model: Area,
          as: 'area',
          include: [{ model: Warehouse, as: 'warehouse' }]
        }
      ]
    })) as DeviceWithRelations[];

    const now = new Date();
    const activeDeviceIds = new Set<string>();

    for (const device of devices) {
      // Skip devices without area/warehouse relation
      if (!device.area || !device.area.warehouse) continue;

      const isDisarmed =
        device.intrusi_system_state === 'DISARMED' ||
        device.intrusi_system_state === null;

      if (!isDisarmed) {
        // Device is ARMED → clear any tracking
        disarmTrackers.delete(device.id);
        continue;
      }

      activeDeviceIds.add(device.id);

      // Track when we first saw this device DISARMED.
      // On server restart the in-memory map is empty even though devices may
      // have been DISARMED for hours. Seed the tracker from the last DISARM
      // event in the database so devices that were disarmed at different times
      // don't all fire reminders simultaneously after a restart.
      let tracker = disarmTrackers.get(device.id);
      if (!tracker) {
        let firstSeenDisarmedAt = now;
        try {
          const lastDisarmLog = await IntrusiLog.findOne({
            where: { device_id: device.id, event_type: 'DISARM' },
            order: [['timestamp', 'DESC']]
          });
          if (lastDisarmLog) {
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
          continue; // Not yet past threshold — wait
        }
        // Already past threshold — fall through to send reminder immediately
      }

      const disarmedDurationMs =
        now.getTime() - tracker.firstSeenDisarmedAt.getTime();

      // Check if disarmed for longer than threshold
      if (disarmedDurationMs < DISARM_THRESHOLD_MS) continue;

      // Check cooldown — don't re-send too frequently
      if (
        tracker.lastReminderSentAt &&
        now.getTime() - tracker.lastReminderSentAt.getTime() <
          REMINDER_COOLDOWN_MS
      ) {
        continue;
      }

      // Send reminder
      console.log(
        `[DisarmReminder] Device ${device.name} (${device.id}) DISARMED for ${Math.round(disarmedDurationMs / 60000)} minutes — sending reminder.`
      );
      await sendDisarmReminder(device);
      tracker.lastReminderSentAt = now;
    }

    // Cleanup trackers for devices that no longer exist
    for (const trackedId of disarmTrackers.keys()) {
      if (!activeDeviceIds.has(trackedId)) {
        disarmTrackers.delete(trackedId);
      }
    }
  } catch (error) {
    console.error('[DisarmReminder] Error checking disarmed devices:', error);
  }
};

/**
 * Start the cron job. Called from server.ts during startup.
 */
export const startDisarmReminderJob = () => {
  cron.schedule(JOB_INTERVAL_CRON, checkDisarmedDevices);
  console.log(
    '[DisarmReminder] Disarm reminder job scheduled (every 10 minutes).'
  );
};
