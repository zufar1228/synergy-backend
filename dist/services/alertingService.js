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
exports.processPowerAlert = exports.processIntrusiAlert = exports.processSensorDataForAlerts = void 0;
// backend/src/services/alertingService.ts
const models_1 = require("../db/models");
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const notificationService_1 = require("./notificationService"); // <-- IMPORT BARU
const actuationService = __importStar(require("./actuationService")); // <-- IMPORT BARU
const webPushService = __importStar(require("./webPushService")); // <-- IMPORT PUSH
const telegramService = __importStar(require("./telegramService")); // <-- IMPORT TELEGRAM
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
const THRESHOLDS = {
    lingkungan: {
        temp: { max: 40 }, // Suhu maks 40°C
        co2: { max: 1500 } // CO2 maks 1500 ppm
    }
};
// ============================================================================
// IN-MEMORY CACHE untuk melacak status alert terakhir per device
// Ini membantu mengatasi race condition dengan simulator yang mengupdate DB langsung
// ============================================================================
const deviceAlertState = new Map();
/**
 * Mengirim notifikasi (email, push, dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
const notifySubscribers = async (systemType, subject, emailProps, emailFunction) => {
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
    // === TASK 2: SIAPKAN EMAIL ===
    const emailTask = (async () => {
        try {
            const { data: { users } } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
            const subscribedUsers = users
                .filter((user) => userIds.includes(user.id))
                .map((user) => ({ email: user.email }));
            const emailPromises = subscribedUsers.map((user) => emailFunction({ to: user.email, subject, emailProps }));
            await Promise.all(emailPromises);
            console.log('[Alerting] All emails processed.');
        }
        catch (error) {
            console.error('[Alerting] Email processing failed:', error);
        }
    })();
    // === EKSEKUSI SEMUANYA BERSAMAAN ===
    // Push, Email, dan Telegram jalan paralel
    await Promise.all([pushTask, emailTask, telegramTask]);
};
/**
 * Memproses data sensor, membandingkan dengan ambang batas, dan mengontrol aktuator
 */
const processSensorDataForAlerts = async (deviceId, systemType, data) => {
    if (systemType !== 'lingkungan')
        return;
    const { temp, co2_ppm } = data;
    console.log(`[Alerting] Menerima data untuk ${deviceId}: Temp=${temp}, CO2=${co2_ppm}`); // <-- LOG 1
    if (temp === undefined && co2_ppm === undefined) {
        console.log('[Alerting] Data tidak lengkap (temp/co2 tidak ada). Keluar.');
        return;
    }
    // 1. Dapatkan status perangkat saat ini (termasuk status kipas)
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: 'area',
                include: [{ model: models_1.Warehouse, as: 'warehouse' }]
            }
        ]
    }));
    if (!device) {
        console.error(`[Alerting] GAGAL: Perangkat dengan ID ${deviceId} tidak ditemukan.`);
        return;
    }
    if (!device.area || !device.area.warehouse) {
        console.error(`[Alerting] GAGAL: Relasi Area/Gudang untuk perangkat ${deviceId} tidak ditemukan.`);
        return;
    }
    const { area, fan_status } = device;
    const { warehouse } = area;
    // 2. Tentukan kondisi berdasarkan sensor values (BUKAN fan_status!)
    const tempLimit = THRESHOLDS.lingkungan.temp.max;
    const co2Limit = THRESHOLDS.lingkungan.co2.max;
    const isAlertTriggered = temp > tempLimit || co2_ppm > co2Limit;
    // Ambil state sebelumnya dari cache
    const previousState = deviceAlertState.get(deviceId);
    const wasAlertTriggered = previousState?.wasAlertTriggered ?? false;
    console.log(`[Alerting] Status saat ini: Alert=${isAlertTriggered}, WasAlert=${wasAlertTriggered}, DB fan_status=${device.fan_status}`);
    const timestamp = (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
        locale: locale_1.id
    });
    // 3. Terapkan Logika Kontrol berdasarkan TRANSISI state
    // Kondisi ALERT: Sekarang alert terpicu DAN sebelumnya tidak alert
    // Kondisi NORMAL: Sekarang tidak alert DAN sebelumnya alert
    console.log(`[Alerting] DEBUG: isAlertTriggered=${isAlertTriggered}, wasAlertTriggered=${wasAlertTriggered}`);
    console.log(`[Alerting] DEBUG: Condition for ALERT: isAlertTriggered=${isAlertTriggered} && !wasAlertTriggered=${!wasAlertTriggered} → ${isAlertTriggered && !wasAlertTriggered}`);
    console.log(`[Alerting] DEBUG: Condition for NORMAL: !isAlertTriggered=${!isAlertTriggered} && wasAlertTriggered=${wasAlertTriggered} → ${!isAlertTriggered && wasAlertTriggered}`);
    if (isAlertTriggered && !wasAlertTriggered) {
        // --- KONDISI: TRANSISI KE ALERT (baru saja melewati threshold) ---
        console.log(`[Alerting] 🚨 PERINGATAN terpicu untuk ${device.name}. Menyalakan kipas...`);
        // Update cache DULU agar tidak double-trigger
        deviceAlertState.set(deviceId, {
            wasAlertTriggered: true,
            notificationSentAt: new Date()
        });
        // Tentukan detail peringatan
        let incidentType = temp > tempLimit ? 'Suhu Terlalu Tinggi' : 'Kadar CO2 Tinggi';
        let details = temp > tempLimit
            ? [
                { key: 'Suhu', value: `${temp}°C` },
                { key: 'Batas', value: `${tempLimit}°C` }
            ]
            : [
                { key: 'CO2', value: `${co2_ppm} ppm` },
                { key: 'Batas', value: `${co2Limit} ppm` }
            ];
        // a. Kirim Perintah 'On' (jika belum On)
        if (device.fan_status !== 'On') {
            console.log(`[Alerting] 🚨 Sending fan ON command...`);
            await actuationService.controlFanRelay(deviceId, 'On');
            console.log(`[Alerting] 🚨 Fan ON command sent!`);
        }
        else {
            console.log(`[Alerting] 🚨 Fan already ON in DB, skipping actuation.`);
        }
        console.log(`[Alerting] 🚨 Now sending ALERT notifications...`);
        // b. Kirim Notifikasi Peringatan
        const emailProps = {
            incidentType,
            warehouseName: warehouse.name,
            areaName: area.name,
            deviceName: device.name,
            timestamp,
            details
        };
        const subject = `[PERINGATAN Kritis] Terdeteksi ${incidentType} di ${warehouse.name}`;
        try {
            console.log(`[Alerting] 🚨 Calling notifySubscribers for ALERT...`);
            await notifySubscribers('lingkungan', subject, emailProps, notificationService_1.sendAlertEmail);
            console.log(`[Alerting] 🚨 notifySubscribers for ALERT completed!`);
        }
        catch (err) {
            console.error(`[Alerting] ❌ Error in notifySubscribers for ALERT:`, err);
        }
    }
    else if (!isAlertTriggered && wasAlertTriggered) {
        // --- KONDISI: TRANSISI KE NORMAL (kembali di bawah threshold) ---
        console.log(`[Alerting] ✅ NORMAL kembali untuk ${device.name}. Mematikan kipas...`);
        // Update cache DULU
        deviceAlertState.set(deviceId, { wasAlertTriggered: false });
        // a. Kirim Perintah 'Off' (jika belum Off)
        if (device.fan_status !== 'Off') {
            console.log(`[Alerting] ✅ Sending fan OFF command...`);
            await actuationService.controlFanRelay(deviceId, 'Off');
            console.log(`[Alerting] ✅ Fan OFF command sent!`);
        }
        else {
            console.log(`[Alerting] ✅ Fan already OFF in DB, skipping actuation.`);
        }
        console.log(`[Alerting] ✅ Now sending NORMAL notifications...`);
        // b. Kirim Notifikasi "Kembali Normal"
        const emailProps = {
            warehouseName: warehouse.name,
            areaName: area.name,
            deviceName: device.name,
            timestamp
        };
        const subject = `[Info] Sistem Lingkungan di ${warehouse.name} Kembali Normal`;
        try {
            console.log(`[Alerting] ✅ Calling notifySubscribers for NORMAL...`);
            await notifySubscribers('lingkungan', subject, emailProps, notificationService_1.sendAllClearEmail);
            console.log(`[Alerting] ✅ notifySubscribers for NORMAL completed!`);
        }
        catch (err) {
            console.error(`[Alerting] ❌ Error in notifySubscribers for NORMAL:`, err);
        }
    }
    else {
        // --- KONDISI STABIL ---
        // Update cache to keep it in sync
        if (isAlertTriggered !== wasAlertTriggered) {
            deviceAlertState.set(deviceId, { wasAlertTriggered: isAlertTriggered });
        }
        console.log('[Alerting] Kondisi stabil. Tidak ada aksi diperlukan.');
    }
};
exports.processSensorDataForAlerts = processSensorDataForAlerts;
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
    const timestamp = (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
        locale: locale_1.id
    });
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
        // v19: show threat_score (leaky bucket) instead of hit_count
        if (data.threat_score != null) {
            details.push({
                key: 'Threat Score',
                value: Number(data.threat_score).toFixed(2)
            });
        }
        else if (data.hit_count != null) {
            details.push({ key: 'Hit Count', value: String(data.hit_count) });
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
    const subject = `🚨 [ALARM INTRUSI] ${incidentType} di ${warehouse.name} - ${area.name}`;
    try {
        await notifySubscribers('intrusi', subject, emailProps, notificationService_1.sendAlertEmail);
        console.log('[Alerting] Intrusi alert notifications sent.');
    }
    catch (err) {
        console.error('[Alerting] Error sending intrusi alert notifications:', err);
    }
};
exports.processIntrusiAlert = processIntrusiAlert;
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
    const timestamp = (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
        locale: locale_1.id
    });
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
        await notifySubscribers('intrusi', subject, emailProps, notificationService_1.sendAlertEmail);
        console.log(`[Alerting] Power/battery alert sent for ${deviceId}.`);
    }
    catch (err) {
        console.error('[Alerting] Error sending power alert:', err);
    }
};
exports.processPowerAlert = processPowerAlert;
