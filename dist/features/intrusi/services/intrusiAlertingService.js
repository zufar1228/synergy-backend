"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPowerAlert = exports.processIntrusiAlert = void 0;
// features/intrusi/services/intrusiAlertingService.ts
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const time_1 = require("../../../utils/time");
const alertingService_1 = require("../../../services/alertingService");
// Cooldown to suppress duplicate Telegram alerts when the firmware sends both
// UNAUTHORIZED_OPEN and FORCED_ENTRY_ALARM for the same physical incident.
const deviceIntrusiAlertState = new Map();
const INTRUSION_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const devicePowerState = new Map();
// Prune stale entries every 30 minutes to avoid orphaned device entries
setInterval(() => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    for (const [key, date] of deviceIntrusiAlertState) {
        if (date.getTime() < cutoff)
            deviceIntrusiAlertState.delete(key);
    }
    for (const [key, state] of devicePowerState) {
        const lastActivity = state.lastBatteryCriticalSentAt?.getTime() ?? 0;
        if (lastActivity < cutoff && state.lastPowerSource)
            continue; // keep if has power state
        if (lastActivity < cutoff)
            devicePowerState.delete(key);
    }
}, 30 * 60 * 1000);
/**
 * Process alarm events from the door security (intrusi) system.
 * Called for FORCED_ENTRY_ALARM and UNAUTHORIZED_OPEN events.
 */
const processIntrusiAlert = async (deviceId, data) => {
    console.log(`[Alerting] 🚨 Intrusi alarm: ${data.type} for device ${deviceId}`);
    // Suppress duplicate alerts for the same device within the cooldown window.
    const now = new Date();
    const lastSent = deviceIntrusiAlertState.get(deviceId);
    if (lastSent &&
        now.getTime() - lastSent.getTime() < INTRUSION_ALERT_COOLDOWN_MS) {
        console.log(`[Alerting] Intrusi alert suppressed (cooldown) for device ${deviceId} — last sent ${Math.round((now.getTime() - lastSent.getTime()) / 1000)}s ago`);
        return;
    }
    deviceIntrusiAlertState.set(deviceId, now);
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
        await (0, alertingService_1.notifySubscribers)('intrusi', subject, emailProps);
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
const BATTERY_CRITICAL_PCT = 10;
const BATTERY_ALERT_COOLDOWN_MS = 30 * 60 * 1000;
/**
 * Process power/battery status and send alerts when:
 * - Power source changes (MAINS ↔ BATTERY)
 * - Battery percentage drops to critical level
 */
const processPowerAlert = async (deviceId, data) => {
    const state = devicePowerState.get(deviceId) || {};
    let shouldAlert = false;
    let alertType = 'power_change';
    if (data.power_source &&
        state.lastPowerSource &&
        data.power_source !== state.lastPowerSource) {
        shouldAlert = true;
        alertType = 'power_change';
        console.log(`[Alerting] ⚡ Power source changed for ${deviceId}: ${state.lastPowerSource} → ${data.power_source}`);
    }
    if (data.power_source) {
        state.lastPowerSource = data.power_source;
    }
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
        await (0, alertingService_1.notifySubscribers)('intrusi', subject, emailProps);
        console.log(`[Alerting] Power/battery alert sent for ${deviceId}.`);
    }
    catch (err) {
        console.error('[Alerting] Error sending power alert:', err);
    }
};
exports.processPowerAlert = processPowerAlert;
