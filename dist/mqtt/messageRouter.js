"use strict";
/**
 * @file messageRouter.ts
 * @purpose Route and process inbound MQTT status/sensor messages
 * @usedBy mqtt client orchestrator
 * @deps domain services, dedup store, payload utils, logger
 * @exports routeIncomingMessage
 * @sideEffects DB writes, alert dispatch, SSE relay
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeIncomingMessage = void 0;
const intrusiService = __importStar(require("../features/intrusi/services/intrusiService"));
const lingkunganService = __importStar(require("../features/lingkungan/services/lingkunganService"));
const deviceService_1 = require("../services/deviceService");
const intrusiAlertingService = __importStar(require("../features/intrusi/services/intrusiAlertingService"));
const latencyTrackerService_1 = require("../features/intrusi/services/latencyTrackerService");
const dedupStore_1 = require("./dedupStore");
const logger_1 = require("./logger");
const payloadUtils_1 = require("./payloadUtils");
const buildLatencyMeta = (payload, mqttRxMs) => ({
    traceId: typeof payload.trace_id === 'string' ? payload.trace_id : undefined,
    runId: typeof payload.test_run_id === 'string' ? payload.test_run_id : undefined,
    scenario: typeof payload.test_scenario === 'string'
        ? payload.test_scenario
        : undefined,
    publishMs: (0, payloadUtils_1.toOptionalNumber)(payload.publish_ms),
    deviceMs: (0, payloadUtils_1.toOptionalNumber)(payload.device_ms),
    mqttRxMs,
    bypassCooldown: (0, payloadUtils_1.toBooleanFlag)(payload.test_bypass_cooldown)
});
const maybeApplyControlModeFromStatus = async (deviceId, incomingMode, extraFields) => {
    if (incomingMode === undefined)
        return;
    try {
        const { db } = await Promise.resolve().then(() => __importStar(require('../db/drizzle')));
        const { devices } = await Promise.resolve().then(() => __importStar(require('../db/schema')));
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [currentDevice] = await db
            .select({
            control_mode: devices.control_mode,
            manual_override_until: devices.manual_override_until
        })
            .from(devices)
            .where(eq(devices.id, deviceId))
            .limit(1);
        const hasActiveOverride = currentDevice &&
            currentDevice.control_mode === 'MANUAL' &&
            currentDevice.manual_override_until &&
            new Date(currentDevice.manual_override_until) > new Date();
        if (!hasActiveOverride) {
            extraFields.control_mode = String(incomingMode);
            return;
        }
        logger_1.log.debug('Skipping control_mode update from ESP32 — active manual override for', deviceId);
    }
    catch (modeError) {
        logger_1.log.error('Error checking manual override:', modeError);
        // Fall back to payload value when lookup fails.
        extraFields.control_mode = String(incomingMode);
    }
};
const maybeRelayCalibrationStatus = async (deviceId, statusData) => {
    if (!statusData?.cal_state)
        return;
    try {
        const { emit } = await Promise.resolve().then(() => __importStar(require('../features/calibration/services/calibrationEventBus')));
        emit(deviceId, statusData);
    }
    catch (relayError) {
        logger_1.log.error('Failed to relay calibration status event:', relayError);
    }
};
const processStatusMessage = async (deviceId, message) => {
    logger_1.log.debug('Heartbeat from', deviceId);
    const mqttRxMs = Date.now();
    let extraFields;
    let parsedStatus;
    try {
        parsedStatus = JSON.parse(message);
        const latencyMeta = buildLatencyMeta(parsedStatus, mqttRxMs);
        await (0, latencyTrackerService_1.recordLatencyStage)({
            traceId: latencyMeta.traceId,
            runId: latencyMeta.runId,
            scenario: latencyMeta.scenario,
            deviceId,
            eventType: 'status',
            t0PublishMs: latencyMeta.publishMs,
            deviceMs: latencyMeta.deviceMs,
            t1MqttRxMs: latencyMeta.mqttRxMs
        });
        if (parsedStatus.door ||
            parsedStatus.state ||
            parsedStatus.siren ||
            parsedStatus.power ||
            parsedStatus.vbat_v !== undefined) {
            extraFields = {};
            if (parsedStatus.door)
                extraFields.door_state = parsedStatus.door;
            if (parsedStatus.state)
                extraFields.intrusi_system_state = parsedStatus.state;
            if (parsedStatus.siren)
                extraFields.siren_state = parsedStatus.siren;
            if (parsedStatus.power)
                extraFields.power_source = parsedStatus.power;
            if (parsedStatus.vbat_v !== undefined) {
                extraFields.vbat_voltage = parseFloat(parsedStatus.vbat_v);
            }
            if (parsedStatus.vbat_pct !== undefined) {
                extraFields.vbat_pct = parseInt(parsedStatus.vbat_pct, 10);
            }
            logger_1.log.debug('Intrusi status fields:', extraFields);
        }
        extraFields = extraFields || {};
        if (parsedStatus.fan !== undefined) {
            extraFields.fan_state = parsedStatus.fan;
        }
        if (parsedStatus.dehumidifier !== undefined) {
            extraFields.dehumidifier_state = parsedStatus.dehumidifier;
        }
        await maybeApplyControlModeFromStatus(deviceId, parsedStatus.mode, extraFields);
        if (parsedStatus.power || parsedStatus.vbat_pct !== undefined) {
            try {
                await intrusiAlertingService.processPowerAlert(deviceId, {
                    power_source: parsedStatus.power,
                    vbat_v: parsedStatus.vbat_v !== undefined
                        ? parseFloat(parsedStatus.vbat_v)
                        : undefined,
                    vbat_pct: parsedStatus.vbat_pct !== undefined
                        ? parseInt(parsedStatus.vbat_pct, 10)
                        : undefined
                }, latencyMeta);
            }
            catch (alertError) {
                logger_1.log.error('Power alert processing error:', alertError);
            }
        }
    }
    catch {
        // Non-JSON status payloads are accepted; heartbeat still updates.
    }
    await maybeRelayCalibrationStatus(deviceId, parsedStatus);
    await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, extraFields);
    logger_1.log.debug('Heartbeat processed for', deviceId);
};
const processSensorMessage = async (deviceId, systemType, message) => {
    logger_1.log.debug('Sensor data from', deviceId, 'type:', systemType);
    const data = JSON.parse(message);
    const mqttRxMs = Date.now();
    const latencyMeta = buildLatencyMeta(data, mqttRxMs);
    await (0, latencyTrackerService_1.recordLatencyStage)({
        traceId: latencyMeta.traceId,
        runId: latencyMeta.runId,
        scenario: latencyMeta.scenario,
        deviceId,
        eventType: typeof data.type === 'string' && data.type.length > 0
            ? data.type
            : systemType,
        t0PublishMs: latencyMeta.publishMs,
        deviceMs: latencyMeta.deviceMs,
        t1MqttRxMs: latencyMeta.mqttRxMs
    });
    const payloadHash = `${data.type ?? ''}|${data.temperature ?? ''}|${data.humidity ?? ''}|${data.co2 ?? ''}|${data.door ?? ''}|${data.trace_id ?? ''}|${data.test_run_id ?? ''}|${data.seq ?? ''}|${data.vbat_pct ?? ''}|${data.power ?? ''}`;
    if ((0, dedupStore_1.isDuplicate)(deviceId, systemType, payloadHash)) {
        logger_1.log.debug('Duplicate QoS 1 message skipped for', deviceId);
        await (0, latencyTrackerService_1.recordLatencyStage)({
            traceId: latencyMeta.traceId,
            runId: latencyMeta.runId,
            scenario: latencyMeta.scenario,
            deviceId,
            eventType: data.type,
            error: 'mqtt_dedup_suppressed'
        });
        return;
    }
    if (systemType === 'intrusi') {
        let derivedSirenState;
        if (data.type === 'SIREN_SILENCED') {
            derivedSirenState = 'COOLDOWN';
        }
        else if (data.type === 'FORCED_ENTRY_ALARM' ||
            data.type === 'UNAUTHORIZED_OPEN') {
            derivedSirenState = 'ON';
        }
        else if (data.type === 'DISARM') {
            derivedSirenState = 'OFF';
        }
        await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, {
            door_state: data.door || undefined,
            intrusi_system_state: data.state || undefined,
            ...(derivedSirenState && { siren_state: derivedSirenState })
        });
        await intrusiService.ingestIntrusiEvent({
            device_id: deviceId,
            event_type: data.type,
            system_state: data.state || 'ARMED',
            door_state: data.door || 'CLOSED',
            peak_delta_g: data.peak_delta_g ?? null,
            hit_count: data.hit_count ?? null,
            payload: data
        });
        await (0, latencyTrackerService_1.recordLatencyStage)({
            traceId: latencyMeta.traceId,
            runId: latencyMeta.runId,
            scenario: latencyMeta.scenario,
            deviceId,
            eventType: data.type,
            t2DbInsertMs: Date.now()
        });
        logger_1.log.info('Intrusi event saved:', data.type, 'device:', deviceId);
        if (['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'].includes(data.type)) {
            logger_1.log.info('Alarm event detected, processing alerts...');
            await intrusiAlertingService.processIntrusiAlert(deviceId, data, latencyMeta);
        }
        return;
    }
    if (systemType === 'lingkungan') {
        await (0, deviceService_1.updateDeviceHeartbeat)(deviceId, {
            last_temperature: data.temperature,
            last_humidity: data.humidity,
            last_co2: data.co2
        });
        await lingkunganService.ingestSensorData({
            device_id: deviceId,
            temperature: data.temperature,
            humidity: data.humidity,
            co2: data.co2
        });
        logger_1.log.info('Lingkungan data saved for device:', deviceId);
        return;
    }
    logger_1.log.warn('Unknown system type:', systemType);
};
const routeIncomingMessage = async (topic, payload, packet) => {
    logger_1.log.debug('Message received:', topic);
    if (packet.retain) {
        logger_1.log.debug('Retained message skipped (topic:', topic, ')');
        return;
    }
    try {
        const topicParts = topic.split('/');
        const message = payload.toString();
        if (topicParts.length < 7) {
            logger_1.log.warn('Invalid topic format (too short):', topic);
            return;
        }
        const deviceId = topicParts[5];
        if (topicParts.length === 7 && topicParts[6] === 'status') {
            await processStatusMessage(deviceId, message);
            return;
        }
        if (topicParts.length === 8 && topicParts[6] === 'sensors') {
            await processSensorMessage(deviceId, topicParts[7], message);
            return;
        }
        logger_1.log.warn('Unhandled topic format:', topic);
    }
    catch (error) {
        if (error instanceof Error) {
            logger_1.log.error('Error processing message:', error.message);
            logger_1.log.debug('Stack:', error.stack);
            return;
        }
        logger_1.log.error('Unknown error processing message:', error);
    }
};
exports.routeIncomingMessage = routeIncomingMessage;
