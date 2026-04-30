"use strict";
/**
 * @file lingkunganAlertingService.ts
 * @purpose Domain-specific alert logic for lingkungan — anti-spam gatekeeper + alert formatting
 * @usedBy mqtt/client (on lingkungan message), alertingService
 * @deps db/drizzle, schema (devices), alertingService, time util, env
 * @exports shouldSendLingkunganTelegram, processLingkunganAlert
 * @sideEffects DB read, Telegram + Web Push via alertingService
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processLingkunganAlert = exports.shouldSendLingkunganTelegram = void 0;
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const time_1 = require("../../../utils/time");
const alertingService_1 = require("../../../services/alertingService");
const env_1 = require("../../../config/env");
const lingkunganTelegramState = new Map();
const TELEGRAM_CRITICAL_REMINDER_MS = env_1.env.TELEGRAM_CRITICAL_REMINDER_MS;
const TELEGRAM_RECOVERY_COOLDOWN_MS = env_1.env.TELEGRAM_RECOVERY_COOLDOWN_MS;
// Prune stale entries every 30 minutes to avoid orphaned device entries
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    for (const [key, state] of lingkunganTelegramState) {
        if (state.lastCriticalSentAt < cutoff &&
            state.lastRecoverySentAt < cutoff &&
            !state.alertActive) {
            lingkunganTelegramState.delete(key);
        }
    }
}, 30 * 60 * 1000);
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
        if (!state.alertActive) {
            state.alertActive = true;
            state.lastCriticalSentAt = now;
            lingkunganTelegramState.set(deviceId, state);
            return true;
        }
        if (now - state.lastCriticalSentAt >= TELEGRAM_CRITICAL_REMINDER_MS) {
            state.lastCriticalSentAt = now;
            lingkunganTelegramState.set(deviceId, state);
            return true;
        }
        return false;
    }
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
exports.shouldSendLingkunganTelegram = shouldSendLingkunganTelegram;
/**
 * Process predictive alerts from the environmental monitoring (lingkungan) system.
 * Called when ML predictions exceed safety thresholds.
 */
const processLingkunganAlert = async (deviceId, alerts, data, alertType = 'FAILSAFE') => {
    console.log(`[Alerting] Lingkungan predictive alert for device ${deviceId}`);
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId),
        with: { area: { with: { warehouse: true } } }
    });
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
            subjectPrefix = '[PERINGATAN PREDIKSI LINGKUNGAN]';
            break;
        case 'FAILSAFE':
            incidentType = 'KRITIS: Kondisi Lingkungan Nyata Berbahaya';
            subjectPrefix = '[PERINGATAN KRITIS LINGKUNGAN]';
            break;
        case 'RECOVERY':
            incidentType = 'PEMULIHAN SISTEM: Kondisi Lingkungan Stabil';
            subjectPrefix = '[KEMBALI NORMAL LINGKUNGAN]';
            break;
        default:
            incidentType = 'Kondisi Lingkungan Berbahaya Terdeteksi';
            subjectPrefix = '[PERINGATAN LINGKUNGAN]';
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
        await (0, alertingService_1.notifySubscribers)('lingkungan', subject, emailProps);
        console.log('[Alerting] Lingkungan alert notifications sent.');
    }
    catch (err) {
        console.error('[Alerting] Error sending lingkungan alert notifications:', err);
    }
};
exports.processLingkunganAlert = processLingkunganAlert;
