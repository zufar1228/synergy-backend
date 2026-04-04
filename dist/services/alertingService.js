"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifySubscribers = void 0;
// Shared notification dispatcher — domain-specific alert logic lives in features/
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const webPushService = __importStar(require("./webPushService"));
const telegramService = __importStar(require("./telegramService"));
const lingkunganAlertingService_1 = require("../features/lingkungan/services/lingkunganAlertingService");
/**
 * Mengirim notifikasi (push dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
const notifySubscribers = async (systemType, subject, emailProps) => {
    // 1. Ambil User ID yang subscribe
    const prefs = await drizzle_1.db.query.user_notification_preferences.findMany({
        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.system_type, systemType), (0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.is_enabled, true)),
        columns: { user_id: true }
    });
    const userIds = prefs.map((sub) => sub.user_id);
    // === TASK 1: KIRIM KE TELEGRAM GROUP (SELALU, tidak tergantung subscriber) ===
    const telegramTask = (async () => {
        try {
            const isAlert = subject.includes('PERINGATAN') || subject.includes('🚨');
            if (systemType === 'lingkungan') {
                const allowed = (0, lingkunganAlertingService_1.shouldSendLingkunganTelegram)(emailProps.deviceId, isAlert);
                if (!allowed) {
                    console.log(`[Alerting] Telegram lingkungan suppressed by gatekeeper for device ${emailProps.deviceId || 'unknown'}`);
                    return;
                }
            }
            const emoji = isAlert ? '🚨' : '✅';
            const statusText = isAlert ? 'PERINGATAN BAHAYA' : 'KEMBALI NORMAL';
            let detailText = '';
            if (emailProps.details && Array.isArray(emailProps.details)) {
                detailText = emailProps.details
                    .map((d) => `   • ${d.key}: ${d.value}`)
                    .join('\n');
            }
            const message = `
${emoji} <b>${statusText}</b> ${emoji}

📍 <b>Lokasi:</b> ${emailProps.warehouseName} - ${emailProps.areaName}
🔧 <b>Device:</b> ${emailProps.deviceName}
${emailProps.incidentType ? `⚠️ <b>Tipe:</b> ${emailProps.incidentType}` : ''}
${detailText ? `\n📊 <b>Detail:</b>\n${detailText}` : ''}

🕐 <b>Waktu:</b> ${emailProps.timestamp}

<i>Harap segera diperiksa.</i>
`.trim();
            await telegramService.sendGroupAlert(message);
            console.log('[Alerting] Telegram notification sent to group.');
        }
        catch (error) {
            console.error('[Alerting] Telegram notification failed:', error);
        }
    })();
    if (userIds.length === 0) {
        console.log(`[Alerting] No subscribers for ${systemType}, sending Telegram only.`);
        await telegramTask;
        return;
    }
    // === TASK 2: SIAPKAN PUSH NOTIFICATION ===
    const pushTask = (async () => {
        console.log(`[Alerting] Starting push task for ${userIds.length} users:`, userIds);
        const pushTitle = subject.includes('PERINGATAN') || subject.includes('🚨')
            ? '🚨 BAHAYA TERDETEKSI'
            : '✅ KEMBALI NORMAL';
        const pushBody = `Lokasi: ${emailProps.warehouseName} - ${emailProps.areaName}. ${emailProps.incidentType || 'Status Update'}.`;
        const pushPromises = userIds.map((userId) => webPushService.sendPushNotification(userId, {
            title: pushTitle,
            body: pushBody,
            url: `/dashboard`
        }));
        await Promise.all(pushPromises);
        console.log('[Alerting] All push notifications processed.');
    })();
    await Promise.all([pushTask, telegramTask]);
};
exports.notifySubscribers = notifySubscribers;
