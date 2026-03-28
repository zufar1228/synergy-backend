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
exports.processPowerAlert = exports.processLingkunganAlert = exports.processIntrusiAlert = void 0;
// backend/src/services/alertingService.ts
const models_1 = require("../db/models");
const webPushService = __importStar(require("./webPushService"));
const telegramService = __importStar(require("./telegramService"));
const time_1 = require("../utils/time");
// Gatekeeper Telegram khusus lingkungan (lapis kedua anti-spam)
const lingkunganTelegramState = new Map();
const TELEGRAM_CRITICAL_REMINDER_MS = Number(process.env.TELEGRAM_CRITICAL_REMINDER_MS ?? 30 * 60 * 1000);
const TELEGRAM_RECOVERY_COOLDOWN_MS = Number(process.env.TELEGRAM_RECOVERY_COOLDOWN_MS ?? 2 * 60 * 1000);
const shouldSendLingkunganTelegram = (deviceId, isAlert) => {
    if (!deviceId)
        return true;
    const now = Date.now();
    const state = lingkunganTelegramState.get(deviceId) ?? {
        alertActive: false,
        lastCriticalSentAt: 0,
        lastRecoverySentAt: 0
    };
    if (isAlert) {
        // Kirim sekali saat transisi normal->kritis
        if (!state.alertActive) {
            state.alertActive = true;
            state.lastCriticalSentAt = now;
            lingkunganTelegramState.set(deviceId, state);
            return true;
        }
        // Selama masih kritis, kirim reminder periodik
        if (now - state.lastCriticalSentAt >= TELEGRAM_CRITICAL_REMINDER_MS) {
            state.lastCriticalSentAt = now;
            lingkunganTelegramState.set(deviceId, state);
            return true;
        }
        return false;
    }
    // Recovery hanya relevan setelah ada episode kritis
    if (!state.alertActive) {
        return false;
    }
    if (now - state.lastRecoverySentAt < TELEGRAM_RECOVERY_COOLDOWN_MS) {
        return false;
    }
    state.alertActive = false;
    state.lastRecoverySentAt = now;
    state.lastCriticalSentAt = 0;
    lingkunganTelegramState.set(deviceId, state);
    return true;
};
/**
 * Mengirim notifikasi (push dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
const notifySubscribers = async (systemType, subject, emailProps) => {
    // 1. Ambil User ID yang subscribe
    const userIds = (await models_1.UserNotificationPreference.findAll({
        where: { system_type: systemType, is_enabled: true },
        attributes: ['user_id']
    })).map((sub) => sub.user_id);
    // === TASK 1: KIRIM KE TELEGRAM GROUP (SELALU, tidak tergantung subscriber) ===
    const telegramTask = (async () => {
        try {
            // Check if this is an alert (not "back to normal" message)
            // Alert subjects contain: PERINGATAN, 🚨
            const isAlert = subject.includes('PERINGATAN') || subject.includes('🚨');
            if (systemType === 'lingkungan') {
                const allowed = shouldSendLingkunganTelegram(emailProps.deviceId, isAlert);
                if (!allowed) {
                    console.log(`[Alerting] Telegram lingkungan suppressed by gatekeeper for device ${emailProps.deviceId || 'unknown'}`);
                    return;
                }
            }
            const emoji = isAlert ? '🚨' : '✅';
            const statusText = isAlert ? 'PERINGATAN BAHAYA' : 'KEMBALI NORMAL';
            // Build detail text from emailProps.details if available
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
    // Jika tidak ada subscriber, hanya kirim Telegram saja
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
        // Map menjadi array of promises
        const pushPromises = userIds.map((userId) => webPushService.sendPushNotification(userId, {
            title: pushTitle,
            body: pushBody,
            url: `/dashboard`
        }));
        // Jalankan paralel
        await Promise.all(pushPromises);
        console.log('[Alerting] All push notifications processed.');
    })();
    // === EKSEKUSI SEMUANYA BERSAMAAN ===
    // Push dan Telegram jalan paralel
    await Promise.all([pushTask, telegramTask]);
};
/**
 * Process alarm events from the door security (intrusi) system.
 * Called for FORCED_ENTRY_ALARM and UNAUTHORIZED_OPEN events.
 */
const processIntrusiAlert = async (deviceId, data) => {
    console.log(`[Alerting] 🚨 Intrusi alarm: ${data.type} for device ${deviceId}`);
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: 'area',
                include: [{ model: models_1.Warehouse, as: 'warehouse' }]
            }
        ]
    }));
    if (!device || !device.area || !device.area.warehouse) {
        console.error(`[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`);
        return;
    }
    const { area } = device;
    const { warehouse } = area;
    const timestamp = (0, time_1.formatTimestampWIB)();
    const isUnauthorizedOpen = data.type === 'UNAUTHORIZED_OPEN';
    const incidentType = isUnauthorizedOpen
        ? 'Pembukaan Pintu Tidak Sah'
        : 'Percobaan Pembobolan (Forced Entry)';
    const details = [
        { key: 'Tipe Event', value: data.type },
        { key: 'Status Pintu', value: data.door || 'N/A' },
        { key: 'Mode Sistem', value: data.state || 'N/A' }
    ];
    if (!isUnauthorizedOpen && data.peak_delta_g != null) {
        details.push({
            key: 'Peak Impact (g)',
            value: data.peak_delta_g.toFixed(3)
        });
        // Windowed threshold: show anomaly_count instead of threat_score/hit_count
        if (data.anomaly_count != null) {
            details.push({
                key: 'Jumlah Anomali (Window)',
                value: `${data.anomaly_count} / ${data.window_threshold ?? 3}`
            });
        }
        else if (data.hit_count != null) {
            details.push({ key: 'Hit Count', value: String(data.hit_count) });
        }
    }
    const emailProps = {
        deviceId,
        incidentType,
        warehouseName: warehouse.name,
        areaName: area.name,
        deviceName: device.name,
        timestamp,
        details
    };
    const subject = `🚨 [ALARM INTRUSI] ${incidentType} di ${warehouse.name} - ${area.name}`;
    try {
        await notifySubscribers('intrusi', subject, emailProps);
        console.log('[Alerting] Intrusi alert notifications sent.');
    }
    catch (err) {
        console.error('[Alerting] Error sending intrusi alert notifications:', err);
    }
};
exports.processIntrusiAlert = processIntrusiAlert;
// ============================================================================
// LINGKUNGAN (Environmental Monitoring) ALERTS
// ============================================================================
/**
 * Process predictive alerts from the environmental monitoring (lingkungan) system.
 * Called when ML predictions exceed safety thresholds.
 */
const processLingkunganAlert = async (deviceId, alerts, data, alertType = 'FAILSAFE') => {
    console.log(`[Alerting] 🌡️ Lingkungan predictive alert for device ${deviceId}`);
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: 'area',
                include: [{ model: models_1.Warehouse, as: 'warehouse' }]
            }
        ]
    }));
    if (!device || !device.area || !device.area.warehouse) {
        console.error(`[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`);
        return;
    }
    const { area } = device;
    const { warehouse } = area;
    const timestamp = (0, time_1.formatTimestampWIB)();
    let incidentType = '';
    let subjectPrefix = '';
    switch (alertType) {
        case 'PREDICTIVE':
            incidentType = 'Prediksi Kondisi Lingkungan Berbahaya';
            subjectPrefix = '⚠️ [PERINGATAN PREDIKSI LINGKUNGAN]';
            break;
        case 'FAILSAFE':
            incidentType = 'KRITIS: Kondisi Lingkungan Nyata Berbahaya';
            subjectPrefix = '🚨 [PERINGATAN KRITIS LINGKUNGAN]';
            break;
        case 'RECOVERY':
            incidentType = 'PEMULIHAN SISTEM: Kondisi Lingkungan Stabil';
            subjectPrefix = '✅ [KEMBALI NORMAL LINGKUNGAN]';
            break;
        default:
            incidentType = 'Kondisi Lingkungan Berbahaya Terdeteksi';
            subjectPrefix = '🌡️ [PERINGATAN LINGKUNGAN]';
    }
    const details = [
        {
            key: 'Suhu Saat Ini',
            value: `${data.temperature.toFixed(1)}°C`
        },
        {
            key: 'Kelembapan Saat Ini',
            value: `${data.humidity.toFixed(1)}%`
        },
        {
            key: 'CO2 Saat Ini',
            value: `${data.co2.toFixed(0)} ppm`
        }
    ];
    alerts.forEach((alert) => {
        details.push({ key: 'Peringatan', value: alert });
    });
    const emailProps = {
        incidentType,
        warehouseName: warehouse.name,
        areaName: area.name,
        deviceName: device.name,
        timestamp,
        details
    };
    const subject = `${subjectPrefix} ${incidentType} di ${warehouse.name} - ${area.name}`;
    try {
        await notifySubscribers('lingkungan', subject, emailProps);
        console.log('[Alerting] Lingkungan alert notifications sent.');
    }
    catch (err) {
        console.error('[Alerting] Error sending lingkungan alert notifications:', err);
    }
};
exports.processLingkunganAlert = processLingkunganAlert;
// ============================================================================
// POWER & BATTERY ALERTS
// ============================================================================
// In-memory cache to prevent duplicate power alerts
const devicePowerState = new Map();
const BATTERY_CRITICAL_PCT = 10;
const BATTERY_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between critical alerts
/**
 * Process power/battery status and send alerts when:
 * - Power source changes (MAINS ↔ BATTERY)
 * - Battery percentage drops to critical level
 */
const processPowerAlert = async (deviceId, data) => {
    const state = devicePowerState.get(deviceId) || {};
    let shouldAlert = false;
    let alertType = 'power_change';
    // Check power source change
    if (data.power_source &&
        state.lastPowerSource &&
        data.power_source !== state.lastPowerSource) {
        shouldAlert = true;
        alertType = 'power_change';
        console.log(`[Alerting] ⚡ Power source changed for ${deviceId}: ${state.lastPowerSource} → ${data.power_source}`);
    }
    // Always update tracked power source
    if (data.power_source) {
        state.lastPowerSource = data.power_source;
    }
    // Check battery critical (only when on BATTERY)
    if (data.vbat_pct !== undefined &&
        data.vbat_pct <= BATTERY_CRITICAL_PCT &&
        data.power_source === 'BATTERY') {
        const now = new Date();
        const lastSent = state.lastBatteryCriticalSentAt;
        if (!lastSent ||
            now.getTime() - lastSent.getTime() > BATTERY_ALERT_COOLDOWN_MS) {
            shouldAlert = true;
            alertType = 'battery_critical';
            state.lastBatteryCriticalSentAt = now;
            console.log(`[Alerting] 🪫 Battery critical for ${deviceId}: ${data.vbat_pct}%`);
        }
    }
    devicePowerState.set(deviceId, state);
    if (!shouldAlert)
        return;
    // Fetch device relations for notification context
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: 'area',
                include: [{ model: models_1.Warehouse, as: 'warehouse' }]
            }
        ]
    }));
    if (!device || !device.area || !device.area.warehouse) {
        console.error(`[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`);
        return;
    }
    const { area } = device;
    const { warehouse } = area;
    const timestamp = (0, time_1.formatTimestampWIB)();
    let incidentType;
    let subject;
    const details = [];
    if (alertType === 'battery_critical') {
        incidentType = 'Baterai Kritis';
        subject = `🪫 [BATERAI KRITIS] ${device.name} di ${warehouse.name} - ${area.name}`;
        details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
        if (data.vbat_v !== undefined) {
            details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
        }
        details.push({ key: 'Sumber Daya', value: 'BATERAI (Adaptor Terputus)' });
    }
    else {
        const isSwitchToBattery = data.power_source === 'BATTERY';
        incidentType = isSwitchToBattery
            ? 'Sumber Daya Beralih ke Baterai'
            : 'Sumber Daya Adaptor Terhubung Kembali';
        subject = isSwitchToBattery
            ? `⚡ [DAYA BERALIH] ${device.name} beralih ke Baterai — ${warehouse.name}`
            : `✅ [DAYA PULIH] ${device.name} kembali ke Adaptor — ${warehouse.name}`;
        details.push({
            key: 'Sumber Daya',
            value: isSwitchToBattery ? 'BATERAI' : 'ADAPTOR (PLN)'
        });
        if (data.vbat_pct !== undefined) {
            details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
        }
        if (data.vbat_v !== undefined) {
            details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
        }
    }
    const emailProps = {
        incidentType,
        warehouseName: warehouse.name,
        areaName: area.name,
        deviceName: device.name,
        timestamp,
        details
    };
    try {
        await notifySubscribers('intrusi', subject, emailProps);
        console.log(`[Alerting] Power/battery alert sent for ${deviceId}.`);
    }
    catch (err) {
        console.error('[Alerting] Error sending power alert:', err);
    }
};
exports.processPowerAlert = processPowerAlert;
