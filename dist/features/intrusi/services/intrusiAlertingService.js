"use strict";
/**
 * @file intrusiAlertingService.ts
 * @purpose Domain-specific alert logic for intrusi events (cooldown, formatting, dispatch)
 * @usedBy mqtt/client (on intrusi message)
 * @deps db/drizzle, schema (devices), alertingService, latencyTrackerService, time util
 * @exports resetIntrusiAlertCooldownForTest, processIntrusiAlert, processPowerAlert
 * @sideEffects DB read, Telegram + Web Push via alertingService
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPowerAlert = exports.processIntrusiAlert = exports.resetIntrusiAlertCooldownForTest = void 0;
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const time_1 = require("../../../utils/time");
const alertingService_1 = require("../../../services/alertingService");
const latencyTrackerService_1 = require("./latencyTrackerService");
// Cooldown to suppress duplicate Telegram alerts when the firmware sends both
// UNAUTHORIZED_OPEN and FORCED_ENTRY_ALARM for the same physical incident.
const deviceIntrusiAlertState = new Map();
const INTRUSION_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const devicePowerState = new Map();
const resetIntrusiAlertCooldownForTest = (deviceId) => {
    if (deviceId) {
        deviceIntrusiAlertState.delete(deviceId);
        devicePowerState.delete(deviceId);
        return;
    }
    deviceIntrusiAlertState.clear();
    devicePowerState.clear();
};
exports.resetIntrusiAlertCooldownForTest = resetIntrusiAlertCooldownForTest;
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
const processIntrusiAlert = async (deviceId, data, meta = {}) => {
    console.log(`[Alerting] 🚨 Intrusi alarm: ${data.type} for device ${deviceId}`);
    await (0, latencyTrackerService_1.recordLatencyStage)({
        traceId: meta.traceId,
        runId: meta.runId,
        scenario: meta.scenario,
        deviceId,
        eventType: data.type,
        t0PublishMs: meta.publishMs,
        deviceMs: meta.deviceMs,
        t1MqttRxMs: meta.mqttRxMs,
        t3AlertDecisionMs: Date.now()
    });
    // Suppress duplicate alerts for the same device within the cooldown window.
    const now = new Date();
    const lastSent = deviceIntrusiAlertState.get(deviceId);
    if (!meta.bypassCooldown &&
        lastSent &&
        now.getTime() - lastSent.getTime() < INTRUSION_ALERT_COOLDOWN_MS) {
        console.log(`[Alerting] Intrusi alert suppressed (cooldown) for device ${deviceId} — last sent ${Math.round((now.getTime() - lastSent.getTime()) / 1000)}s ago`);
        await (0, latencyTrackerService_1.recordLatencyStage)({
            traceId: meta.traceId,
            runId: meta.runId,
            scenario: meta.scenario,
            deviceId,
            eventType: data.type,
            cooldownSuppressed: true,
            error: 'intrusi_cooldown_suppressed'
        });
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
        {
            key: 'Mode Sistem',
            value: data.state === 'ARMED'
                ? 'AKTIF'
                : data.state === 'DISARMED'
                    ? 'NON-AKTIF'
                    : data.state || 'N/A'
        }
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
        isAlert: true,
        incidentType,
        warehouseName: warehouse.name,
        areaName: area.name,
        deviceName: device.name,
        timestamp,
        details,
        ...((0, latencyTrackerService_1.isLatencyTrace)(meta.traceId)
            ? {
                latencyTrace: {
                    traceId: meta.traceId,
                    runId: meta.runId,
                    scenario: meta.scenario,
                    deviceMs: meta.deviceMs,
                    publishMs: meta.publishMs,
                    mqttRxMs: meta.mqttRxMs,
                    eventType: data.type,
                    deviceId
                }
            }
            : {})
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
const processPowerAlert = async (deviceId, data, meta = {}) => {
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
        if (meta.bypassCooldown ||
            !lastSent ||
            now.getTime() - lastSent.getTime() > BATTERY_ALERT_COOLDOWN_MS) {
            shouldAlert = true;
            alertType = 'battery_critical';
            state.lastBatteryCriticalSentAt = now;
            console.log(`[Alerting] 🪫 Battery critical for ${deviceId}: ${data.vbat_pct}%`);
        }
        else {
            await (0, latencyTrackerService_1.recordLatencyStage)({
                traceId: meta.traceId,
                runId: meta.runId,
                scenario: meta.scenario,
                deviceId,
                eventType: 'battery_critical',
                cooldownSuppressed: true,
                error: 'battery_cooldown_suppressed'
            });
        }
    }
    devicePowerState.set(deviceId, state);
    if (!shouldAlert) {
        if ((0, latencyTrackerService_1.isLatencyTrace)(meta.traceId)) {
            await (0, latencyTrackerService_1.recordLatencyStage)({
                traceId: meta.traceId,
                runId: meta.runId,
                scenario: meta.scenario,
                deviceId,
                eventType: 'power_status',
                error: 'no_power_alert_emitted'
            });
        }
        return;
    }
    const resolvedEventType = alertType === 'battery_critical'
        ? 'battery_critical'
        : data.power_source === 'BATTERY'
            ? 'power_to_battery'
            : 'power_to_mains';
    await (0, latencyTrackerService_1.recordLatencyStage)({
        traceId: meta.traceId,
        runId: meta.runId,
        scenario: meta.scenario,
        deviceId,
        eventType: resolvedEventType,
        t0PublishMs: meta.publishMs,
        deviceMs: meta.deviceMs,
        t1MqttRxMs: meta.mqttRxMs,
        t3AlertDecisionMs: Date.now()
    });
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
    let isAlert = false;
    let incidentType;
    let subject;
    const details = [];
    if (alertType === 'battery_critical') {
        isAlert = true;
        incidentType = 'Baterai Kritis';
        subject = `🪫 [BATERAI KRITIS] ${device.name} di ${warehouse.name} - ${area.name}`;
        details.push({ key: 'Kapasitas Baterai', value: 'Kritis' });
        details.push({ key: 'Sumber Daya', value: 'BATERAI (Adaptor Terputus)' });
    }
    else {
        const isSwitchToBattery = data.power_source === 'BATTERY';
        isAlert = isSwitchToBattery;
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
            const batteryLabel = data.vbat_pct <= BATTERY_CRITICAL_PCT ? 'Kritis' : 'Aman';
            details.push({ key: 'Kapasitas Baterai', value: batteryLabel });
        }
    }
    const emailProps = {
        isAlert,
        incidentType,
        warehouseName: warehouse.name,
        areaName: area.name,
        deviceName: device.name,
        timestamp,
        details,
        ...((0, latencyTrackerService_1.isLatencyTrace)(meta.traceId)
            ? {
                latencyTrace: {
                    traceId: meta.traceId,
                    runId: meta.runId,
                    scenario: meta.scenario,
                    deviceMs: meta.deviceMs,
                    publishMs: meta.publishMs,
                    mqttRxMs: meta.mqttRxMs,
                    eventType: resolvedEventType,
                    deviceId
                }
            }
            : {})
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
