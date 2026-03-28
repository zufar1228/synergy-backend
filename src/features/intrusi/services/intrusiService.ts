// backend/src/services/intrusiService.ts
import { Op } from 'sequelize';
import IntrusiLog from '../models/intrusiLog';
import {
  IntrusiEventType,
  DoorState,
  SystemState,
  AcknowledgeStatus,
  IntrusiLogCreationAttributes
} from '../models/intrusiLog';
import ApiError from '../../../utils/apiError';

/**
 * Ingest a door-security event from MQTT into the database.
 */
export const ingestIntrusiEvent = async (data: {
  device_id: string;
  event_type: IntrusiEventType;
  system_state: SystemState;
  door_state: DoorState;
  peak_delta_g?: number | null;
  hit_count?: number | null;
  payload: object;
}) => {
  const log = await IntrusiLog.create({
    device_id: data.device_id,
    event_type: data.event_type,
    system_state: data.system_state,
    door_state: data.door_state,
    peak_delta_g: data.peak_delta_g ?? null,
    hit_count: data.hit_count ?? null,
    payload: data.payload
  });

  console.log(
    `[IntrusiService] Ingested ${data.event_type} event for device ${data.device_id}`
  );
  return log;
};

/**
 * Get intrusion logs for a device with pagination and filters.
 */
export const getIntrusiLogs = async (options: {
  device_id: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  event_type?: string;
}) => {
  const { device_id, limit = 50, offset = 0, from, to, event_type } = options;
  const where: any = { device_id };

  if (from || to) {
    where.timestamp = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  if (event_type) {
    where.event_type = event_type;
  }

  const { count, rows } = await IntrusiLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['timestamp', 'DESC']]
  });

  return {
    data: rows,
    pagination: {
      total: count,
      limit,
      offset,
      hasMore: offset + limit < count
    }
  };
};

/**
 * Get summary statistics for a device's intrusion events.
 */
export const getIntrusiSummary = async (
  device_id: string,
  from?: string,
  to?: string
) => {
  const where: any = { device_id };

  if (from || to) {
    where.timestamp = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  const total_events = await IntrusiLog.count({ where });

  const alarm_events = await IntrusiLog.count({
    where: {
      ...where,
      event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
    }
  });

  const impact_warnings = await IntrusiLog.count({
    where: { ...where, event_type: 'IMPACT_WARNING' }
  });

  const unacknowledged = await IntrusiLog.count({
    where: { ...where, status: 'unacknowledged' }
  });

  const latest_event = await IntrusiLog.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  return {
    total_events,
    alarm_events,
    impact_warnings,
    unacknowledged,
    latest_event
  };
};

/**
 * Get current door security status for a device.
 */
export const getIntrusiStatus = async (device_id: string) => {
  // Get the latest event to determine current state
  const latestEvent = await IntrusiLog.findOne({
    where: { device_id },
    order: [['timestamp', 'DESC']]
  });

  // Get the latest alarm event (if any)
  const latestAlarm = await IntrusiLog.findOne({
    where: {
      device_id,
      event_type: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']
    },
    order: [['timestamp', 'DESC']]
  });

  // Determine overall status
  let status: 'AMAN' | 'WASPADA' | 'BAHAYA' = 'AMAN';

  // Current system state from the latest event
  const currentSystemState = latestEvent?.system_state ?? 'DISARMED';

  if (latestAlarm && latestAlarm.status === 'unacknowledged') {
    // Check if a DISARM or SIREN_SILENCED event occurred AFTER the alarm.
    // If yes, the operator has responded — downgrade from BAHAYA.
    const clearingEvent = await IntrusiLog.findOne({
      where: {
        device_id,
        event_type: ['DISARM', 'SIREN_SILENCED'],
        timestamp: { [Op.gt]: latestAlarm.timestamp }
      },
      order: [['timestamp', 'DESC']]
    });

    if (clearingEvent || currentSystemState === 'DISARMED') {
      // Operator responded (disarmed or silenced siren) → AMAN
      status = 'AMAN';
    } else {
      status = 'BAHAYA';
    }
  }

  // Get latest impact warning
  const latestImpact = await IntrusiLog.findOne({
    where: { device_id, event_type: 'IMPACT_WARNING' },
    order: [['timestamp', 'DESC']]
  });

  // Only show WASPADA if system is ARMED and no clearing event after the warning
  if (
    status === 'AMAN' &&
    currentSystemState === 'ARMED' &&
    latestImpact &&
    latestImpact.status === 'unacknowledged'
  ) {
    status = 'WASPADA';
  }

  return {
    status,
    system_state: latestEvent?.system_state ?? 'DISARMED',
    door_state: latestEvent?.door_state ?? 'CLOSED',
    latest_event: latestEvent,
    latest_alarm: latestAlarm
  };
};

/**
 * Update the acknowledgement status of an intrusion log.
 */
export const updateIntrusiLogStatus = async (
  logId: string,
  userId: string,
  status: AcknowledgeStatus,
  notes?: string
) => {
  const log = await IntrusiLog.findByPk(logId);
  if (!log) throw new ApiError(404, 'Log intrusi tidak ditemukan.');

  log.status = status;
  log.notes = notes || log.notes;
  log.acknowledged_by = userId;
  log.acknowledged_at = new Date();

  await log.save();
  return log;
};
