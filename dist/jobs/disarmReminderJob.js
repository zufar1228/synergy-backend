"use strict";
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
const node_cron_1 = __importDefault(require("node-cron"));
const models_1 = require("../db/models");
const telegramService = __importStar(require("../services/telegramService"));
const webPushService = __importStar(require("../services/webPushService"));
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
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
    const timestamp = (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
        locale: locale_1.id
    });
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
        console.log(`[DisarmReminder] Telegram reminder sent for device ${device.id}`);
    }
    catch (error) {
        console.error(`[DisarmReminder] Telegram send failed for ${device.id}:`, error);
    }
    // --- Web Push ---
    try {
        const subscriberPrefs = await models_1.UserNotificationPreference.findAll({
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
        // Fetch all intrusi-type devices with their area/warehouse relations
        const devices = (await models_1.Device.findAll({
            where: { system_type: 'intrusi' },
            include: [
                {
                    model: models_1.Area,
                    as: 'area',
                    include: [{ model: models_1.Warehouse, as: 'warehouse' }]
                }
            ]
        }));
        const now = new Date();
        const activeDeviceIds = new Set();
        for (const device of devices) {
            // Skip devices without area/warehouse relation
            if (!device.area || !device.area.warehouse)
                continue;
            const isDisarmed = device.intrusi_system_state === 'DISARMED' ||
                device.intrusi_system_state === null;
            if (!isDisarmed) {
                // Device is ARMED → clear any tracking
                disarmTrackers.delete(device.id);
                continue;
            }
            activeDeviceIds.add(device.id);
            // Track when we first saw this device DISARMED
            let tracker = disarmTrackers.get(device.id);
            if (!tracker) {
                tracker = {
                    firstSeenDisarmedAt: now,
                    lastReminderSentAt: null
                };
                disarmTrackers.set(device.id, tracker);
                console.log(`[DisarmReminder] Tracking started for device ${device.id} (${device.name})`);
                continue; // Don't alert on first detection — wait for threshold
            }
            const disarmedDurationMs = now.getTime() - tracker.firstSeenDisarmedAt.getTime();
            // Check if disarmed for longer than threshold
            if (disarmedDurationMs < DISARM_THRESHOLD_MS)
                continue;
            // Check cooldown — don't re-send too frequently
            if (tracker.lastReminderSentAt &&
                now.getTime() - tracker.lastReminderSentAt.getTime() <
                    REMINDER_COOLDOWN_MS) {
                continue;
            }
            // Send reminder
            console.log(`[DisarmReminder] Device ${device.name} (${device.id}) DISARMED for ${Math.round(disarmedDurationMs / 60000)} minutes — sending reminder.`);
            await sendDisarmReminder(device);
            tracker.lastReminderSentAt = now;
        }
        // Cleanup trackers for devices that no longer exist
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
/**
 * Start the cron job. Called from server.ts during startup.
 */
const startDisarmReminderJob = () => {
    node_cron_1.default.schedule(JOB_INTERVAL_CRON, checkDisarmedDevices);
    console.log('[DisarmReminder] Disarm reminder job scheduled (every 10 minutes).');
};
exports.startDisarmReminderJob = startDisarmReminderJob;
