"use strict";
/**
 * @file disarmReminderJob.ts
 * @purpose Cron job — sends reminder if intrusi device DISARMED for >1 hour
 * @usedBy server.ts (startup)
 * @deps node-cron, db/drizzle, schema (devices, intrusi_logs), alertingService
 * @exports startDisarmReminderJob
 * @sideEffects DB read, Telegram + Web Push notifications, runs every 15min
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDisarmReminderJob = void 0;
//
// Sends a reminder notification (Telegram + Web Push) if an intrusi device
// has been in the DISARMED state for more than 1 hour.
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const telegramService = __importStar(require("../../../services/telegramService"));
const webPushService = __importStar(require("../../../services/webPushService"));
const time_1 = require("../../../utils/time");
// --- Configuration ---
const DISARM_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
const REMINDER_COOLDOWN_MS = 60 * 60 * 1000; // Re-remind every 1 hour
const JOB_INTERVAL_CRON = '*/10 * * * *'; // Check every 10 minutes
const disarmTrackers = new Map();
/**
 * Send the disarm reminder via Telegram group + Web Push to intrusi subscribers.
 */
const sendDisarmReminder = async (device) => {
    const { area } = device;
    const { warehouse } = area;
    const timestamp = (0, time_1.formatTimestampWIB)();
    const telegramMessage = `
⚠️ <b>PENGINGAT: SISTEM BELUM DIAKTIFKAN</b> ⚠️

📍 <b>Lokasi:</b> ${warehouse.name} - ${area.name}
🔧 <b>Device:</b> ${device.name}
🔓 <b>Status:</b> NON-AKTIF selama lebih dari 1 jam

🕐 <b>Waktu Cek:</b> ${timestamp}

<i>Harap segera AKTIFKAN sistem keamanan pintu gudang untuk perlindungan optimal.</i>
`.trim();
    try {
        await telegramService.sendGroupAlert(telegramMessage);
        console.log(`[DisarmReminder] Telegram reminder sent for device ${device.id}`);
    }
    catch (error) {
        console.error(`[DisarmReminder] Telegram send failed for ${device.id}:`, error);
    }
    // --- Web Push ---
    try {
        const subscriberPrefs = await drizzle_1.db.query.user_notification_preferences.findMany({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.system_type, 'intrusi'), (0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.is_enabled, true)),
            columns: { user_id: true }
        });
        const userIds = subscriberPrefs.map((p) => p.user_id);
        if (userIds.length > 0) {
            const pushPayload = {
                title: '⚠️ Sistem Keamanan Belum Aktif',
                body: `${device.name} di ${warehouse.name} - ${area.name} masih NON-AKTIF selama lebih dari 1 jam. Segera AKTIFKAN!`,
                url: '/dashboard'
            };
            await Promise.all(userIds.map((userId) => webPushService.sendPushNotification(userId, pushPayload)));
            console.log(`[DisarmReminder] Web push sent to ${userIds.length} subscriber(s) for device ${device.id}`);
        }
    }
    catch (error) {
        console.error(`[DisarmReminder] Web push failed for ${device.id}:`, error);
    }
};
/**
 * Main check: find DISARMED intrusi devices and send reminders when overdue.
 */
const checkDisarmedDevices = async () => {
    console.log('[DisarmReminder] Running disarm reminder check...');
    try {
        const allDevices = await drizzle_1.db.query.devices.findMany({
            where: (0, drizzle_orm_1.eq)(schema_1.devices.system_type, 'intrusi'),
            with: {
                area: {
                    with: { warehouse: true }
                }
            }
        });
        const now = new Date();
        const activeDeviceIds = new Set();
        for (const device of allDevices) {
            if (!device.area || !device.area.warehouse)
                continue;
            const isDisarmed = device.intrusi_system_state === 'DISARMED' ||
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
                    const lastDisarmLog = await drizzle_1.db.query.intrusi_logs.findFirst({
                        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.intrusi_logs.device_id, device.id), (0, drizzle_orm_1.eq)(schema_1.intrusi_logs.event_type, 'DISARM')),
                        orderBy: [(0, drizzle_orm_1.desc)(schema_1.intrusi_logs.timestamp)]
                    });
                    if (lastDisarmLog?.timestamp) {
                        firstSeenDisarmedAt = lastDisarmLog.timestamp;
                        console.log(`[DisarmReminder] Seeding tracker for device ${device.id} (${device.name}) from last DISARM at ${firstSeenDisarmedAt.toISOString()}`);
                    }
                }
                catch (err) {
                    console.error(`[DisarmReminder] Failed to seed tracker from DB for ${device.id}, using now:`, err);
                }
                tracker = {
                    firstSeenDisarmedAt,
                    lastReminderSentAt: null
                };
                disarmTrackers.set(device.id, tracker);
                if (now.getTime() - firstSeenDisarmedAt.getTime() <
                    DISARM_THRESHOLD_MS) {
                    console.log(`[DisarmReminder] Tracking started for device ${device.id} (${device.name})`);
                    continue;
                }
            }
            const disarmedDurationMs = now.getTime() - tracker.firstSeenDisarmedAt.getTime();
            if (disarmedDurationMs < DISARM_THRESHOLD_MS)
                continue;
            if (tracker.lastReminderSentAt &&
                now.getTime() - tracker.lastReminderSentAt.getTime() <
                    REMINDER_COOLDOWN_MS) {
                continue;
            }
            console.log(`[DisarmReminder] Device ${device.name} (${device.id}) DISARMED for ${Math.round(disarmedDurationMs / 60000)} minutes — sending reminder.`);
            await sendDisarmReminder(device);
            tracker.lastReminderSentAt = now;
        }
        for (const trackedId of disarmTrackers.keys()) {
            if (!activeDeviceIds.has(trackedId)) {
                disarmTrackers.delete(trackedId);
            }
        }
    }
    catch (error) {
        console.error('[DisarmReminder] Error checking disarmed devices:', error);
    }
};
const startDisarmReminderJob = () => {
    const task = node_cron_1.default.schedule(JOB_INTERVAL_CRON, checkDisarmedDevices);
    console.log('[DisarmReminder] Disarm reminder job scheduled (every 10 minutes).');
    return task;
};
exports.startDisarmReminderJob = startDisarmReminderJob;
