/**
 * @file messageRouter.ts
 * @purpose Route and process inbound MQTT status/sensor messages
 * @usedBy mqtt client orchestrator
 * @deps domain services, dedup store, payload utils, logger
 * @exports routeIncomingMessage
 * @sideEffects DB writes, alert dispatch, SSE relay
 */

import * as intrusiService from '../features/intrusi/services/intrusiService';
import * as lingkunganService from '../features/lingkungan/services/lingkunganService';
import { updateDeviceHeartbeat } from '../services/deviceService';
import * as intrusiAlertingService from '../features/intrusi/services/intrusiAlertingService';
import { recordLatencyStage } from '../features/intrusi/services/latencyTrackerService';
import { isDuplicate } from './dedupStore';
import { log } from './logger';
import { toBooleanFlag, toOptionalNumber } from './payloadUtils';

type HeartbeatExtraFields = {
  door_state?: string;
  intrusi_system_state?: string;
  siren_state?: string;
  power_source?: string;
  vbat_voltage?: number;
  vbat_pct?: number;
  last_temperature?: number;
  last_humidity?: number;
  last_co2?: number;
  fan_state?: string;
  dehumidifier_state?: string;
  control_mode?: string;
};

type LatencyMeta = {
  traceId?: string;
  runId?: string;
  scenario?: string;
  publishMs?: number;
  deviceMs?: number;
  mqttRxMs: number;
  bypassCooldown: boolean;
};

const buildLatencyMeta = (payload: any, mqttRxMs: number): LatencyMeta => ({
  traceId: typeof payload.trace_id === 'string' ? payload.trace_id : undefined,
  runId:
    typeof payload.test_run_id === 'string' ? payload.test_run_id : undefined,
  scenario:
    typeof payload.test_scenario === 'string'
      ? payload.test_scenario
      : undefined,
  publishMs: toOptionalNumber(payload.publish_ms),
  deviceMs: toOptionalNumber(payload.device_ms),
  mqttRxMs,
  bypassCooldown: toBooleanFlag(payload.test_bypass_cooldown)
});

const maybeApplyControlModeFromStatus = async (
  deviceId: string,
  incomingMode: unknown,
  extraFields: HeartbeatExtraFields
) => {
  if (incomingMode === undefined) return;

  try {
    const { db } = await import('../db/drizzle');
    const { devices } = await import('../db/schema');
    const { eq } = await import('drizzle-orm');

    const [currentDevice] = await db
      .select({
        control_mode: devices.control_mode,
        manual_override_until: devices.manual_override_until
      })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .limit(1);

    const hasActiveOverride =
      currentDevice &&
      currentDevice.control_mode === 'MANUAL' &&
      currentDevice.manual_override_until &&
      new Date(currentDevice.manual_override_until) > new Date();

    if (!hasActiveOverride) {
      extraFields.control_mode = String(incomingMode);
      return;
    }

    log.debug(
      'Skipping control_mode update from ESP32 — active manual override for',
      deviceId
    );
  } catch (modeError) {
    log.error('Error checking manual override:', modeError);
    // Fall back to payload value when lookup fails.
    extraFields.control_mode = String(incomingMode);
  }
};

const maybeRelayCalibrationStatus = async (
  deviceId: string,
  statusData: any
) => {
  if (!statusData?.cal_state) return;

  try {
    const { emit } =
      await import('../features/calibration/services/calibrationEventBus');
    emit(deviceId, statusData);
  } catch (relayError) {
    log.error('Failed to relay calibration status event:', relayError);
  }
};

const processStatusMessage = async (deviceId: string, message: string) => {
  log.debug('Heartbeat from', deviceId);

  const mqttRxMs = Date.now();
  let extraFields: HeartbeatExtraFields | undefined;
  let parsedStatus: any;

  try {
    parsedStatus = JSON.parse(message);

    const latencyMeta = buildLatencyMeta(parsedStatus, mqttRxMs);

    await recordLatencyStage({
      traceId: latencyMeta.traceId,
      runId: latencyMeta.runId,
      scenario: latencyMeta.scenario,
      deviceId,
      eventType: 'status',
      t0PublishMs: latencyMeta.publishMs,
      deviceMs: latencyMeta.deviceMs,
      t1MqttRxMs: latencyMeta.mqttRxMs
    });

    if (
      parsedStatus.door ||
      parsedStatus.state ||
      parsedStatus.siren ||
      parsedStatus.power ||
      parsedStatus.vbat_v !== undefined
    ) {
      extraFields = {};
      if (parsedStatus.door) extraFields.door_state = parsedStatus.door;
      if (parsedStatus.state)
        extraFields.intrusi_system_state = parsedStatus.state;
      if (parsedStatus.siren) extraFields.siren_state = parsedStatus.siren;
      if (parsedStatus.power) extraFields.power_source = parsedStatus.power;
      if (parsedStatus.vbat_v !== undefined) {
        extraFields.vbat_voltage = parseFloat(parsedStatus.vbat_v);
      }
      if (parsedStatus.vbat_pct !== undefined) {
        extraFields.vbat_pct = parseInt(parsedStatus.vbat_pct, 10);
      }
      log.debug('Intrusi status fields:', extraFields);
    }

    extraFields = extraFields || {};

    if (parsedStatus.fan !== undefined) {
      extraFields.fan_state = parsedStatus.fan;
    }
    if (parsedStatus.dehumidifier !== undefined) {
      extraFields.dehumidifier_state = parsedStatus.dehumidifier;
    }

    await maybeApplyControlModeFromStatus(
      deviceId,
      parsedStatus.mode,
      extraFields
    );

    if (parsedStatus.power || parsedStatus.vbat_pct !== undefined) {
      try {
        await intrusiAlertingService.processPowerAlert(
          deviceId,
          {
            power_source: parsedStatus.power,
            vbat_v:
              parsedStatus.vbat_v !== undefined
                ? parseFloat(parsedStatus.vbat_v)
                : undefined,
            vbat_pct:
              parsedStatus.vbat_pct !== undefined
                ? parseInt(parsedStatus.vbat_pct, 10)
                : undefined
          },
          latencyMeta
        );
      } catch (alertError) {
        log.error('Power alert processing error:', alertError);
      }
    }
  } catch {
    // Non-JSON status payloads are accepted; heartbeat still updates.
  }

  await maybeRelayCalibrationStatus(deviceId, parsedStatus);
  await updateDeviceHeartbeat(deviceId, extraFields);
  log.debug('Heartbeat processed for', deviceId);
};

const processSensorMessage = async (
  deviceId: string,
  systemType: string,
  message: string
) => {
  log.debug('Sensor data from', deviceId, 'type:', systemType);

  const data = JSON.parse(message);
  const mqttRxMs = Date.now();
  const latencyMeta = buildLatencyMeta(data, mqttRxMs);

  await recordLatencyStage({
    traceId: latencyMeta.traceId,
    runId: latencyMeta.runId,
    scenario: latencyMeta.scenario,
    deviceId,
    eventType:
      typeof data.type === 'string' && data.type.length > 0
        ? data.type
        : systemType,
    t0PublishMs: latencyMeta.publishMs,
    deviceMs: latencyMeta.deviceMs,
    t1MqttRxMs: latencyMeta.mqttRxMs
  });

  const payloadHash = `${data.type ?? ''}|${data.temperature ?? ''}|${data.humidity ?? ''}|${data.co2 ?? ''}|${data.door ?? ''}|${data.trace_id ?? ''}|${data.test_run_id ?? ''}|${data.seq ?? ''}|${data.vbat_pct ?? ''}|${data.power ?? ''}`;

  if (isDuplicate(deviceId, systemType, payloadHash)) {
    log.debug('Duplicate QoS 1 message skipped for', deviceId);
    await recordLatencyStage({
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
    let derivedSirenState: string | undefined;

    if (data.type === 'SIREN_SILENCED') {
      derivedSirenState = 'COOLDOWN';
    } else if (
      data.type === 'FORCED_ENTRY_ALARM' ||
      data.type === 'UNAUTHORIZED_OPEN'
    ) {
      derivedSirenState = 'ON';
    } else if (data.type === 'DISARM') {
      derivedSirenState = 'OFF';
    }

    await updateDeviceHeartbeat(deviceId, {
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

    await recordLatencyStage({
      traceId: latencyMeta.traceId,
      runId: latencyMeta.runId,
      scenario: latencyMeta.scenario,
      deviceId,
      eventType: data.type,
      t2DbInsertMs: Date.now()
    });

    log.info('Intrusi event saved:', data.type, 'device:', deviceId);

    if (['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'].includes(data.type)) {
      log.info('Alarm event detected, processing alerts...');
      await intrusiAlertingService.processIntrusiAlert(
        deviceId,
        data,
        latencyMeta
      );
    }

    return;
  }

  if (systemType === 'lingkungan') {
    await updateDeviceHeartbeat(deviceId, {
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

    log.info('Lingkungan data saved for device:', deviceId);
    return;
  }

  log.warn('Unknown system type:', systemType);
};

export const routeIncomingMessage = async (
  topic: string,
  payload: Buffer,
  packet: { retain?: boolean }
): Promise<void> => {
  log.debug('Message received:', topic);

  if (packet.retain) {
    log.debug('Retained message skipped (topic:', topic, ')');
    return;
  }

  try {
    const topicParts = topic.split('/');
    const message = payload.toString();

    if (topicParts.length < 7) {
      log.warn('Invalid topic format (too short):', topic);
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

    log.warn('Unhandled topic format:', topic);
  } catch (error) {
    if (error instanceof Error) {
      log.error('Error processing message:', error.message);
      log.debug('Stack:', error.stack);
      return;
    }

    log.error('Unknown error processing message:', error);
  }
};
