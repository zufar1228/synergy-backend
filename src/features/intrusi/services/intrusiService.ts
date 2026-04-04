// backend/src/services/intrusiService.ts
import { db } from '../../../db/drizzle';
import {
  intrusi_logs,
  type IntrusiEventType,
  type DoorState,
  type SystemState,
  type AcknowledgeStatus
} from '../../../db/schema';
import { eq, and, gte, lte, inArray, count, desc, gt } from 'drizzle-orm';
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
  const [log] = await db
    .insert(intrusi_logs)
    .values({
      device_id: data.device_id,
      event_type: data.event_type,
      system_state: data.system_state,
      door_state: data.door_state,
      peak_delta_g: data.peak_delta_g ?? null,
      hit_count: data.hit_count ?? null,
      payload: data.payload
    })
    .returning();

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
  const conditions = [eq(intrusi_logs.device_id, device_id)];

  if (from) conditions.push(gte(intrusi_logs.timestamp, new Date(from)));
  if (to) conditions.push(lte(intrusi_logs.timestamp, new Date(to)));
  if (event_type) conditions.push(eq(intrusi_logs.event_type, event_type));

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: count() })
    .from(intrusi_logs)
    .where(whereClause);
  const total = Number(countResult.count);

  const data = await db.query.intrusi_logs.findMany({
    where: whereClause,
    limit,
    offset,
    orderBy: [desc(intrusi_logs.timestamp)]
  });

  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
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
  const conditions = [eq(intrusi_logs.device_id, device_id)];
  if (from) conditions.push(gte(intrusi_logs.timestamp, new Date(from)));
  if (to) conditions.push(lte(intrusi_logs.timestamp, new Date(to)));

  const baseWhere = and(...conditions);

  const [totalResult] = await db.select({ count: count() }).from(intrusi_logs).where(baseWhere);

  const [alarmResult] = await db
    .select({ count: count() })
    .from(intrusi_logs)
    .where(and(...conditions, inArray(intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'])));

  const [impactResult] = await db
    .select({ count: count() })
    .from(intrusi_logs)
    .where(and(...conditions, eq(intrusi_logs.event_type, 'IMPACT_WARNING')));

  const [unackResult] = await db
    .select({ count: count() })
    .from(intrusi_logs)
    .where(and(...conditions, eq(intrusi_logs.status, 'unacknowledged')));

  const latest_event = await db.query.intrusi_logs.findFirst({
    where: eq(intrusi_logs.device_id, device_id),
    orderBy: [desc(intrusi_logs.timestamp)]
  });

  return {
    total_events: Number(totalResult.count),
    alarm_events: Number(alarmResult.count),
    impact_warnings: Number(impactResult.count),
    unacknowledged: Number(unackResult.count),
    latest_event
  };
};

/**
 * Get current door security status for a device.
 */
export const getIntrusiStatus = async (device_id: string) => {
  const latestEvent = await db.query.intrusi_logs.findFirst({
    where: eq(intrusi_logs.device_id, device_id),
    orderBy: [desc(intrusi_logs.timestamp)]
  });

  const latestAlarm = await db.query.intrusi_logs.findFirst({
    where: and(
      eq(intrusi_logs.device_id, device_id),
      inArray(intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'])
    ),
    orderBy: [desc(intrusi_logs.timestamp)]
  });

  let status: 'AMAN' | 'WASPADA' | 'BAHAYA' = 'AMAN';
  const currentSystemState = latestEvent?.system_state ?? 'DISARMED';

  if (latestAlarm && latestAlarm.status === 'unacknowledged') {
    const clearingEvent = await db.query.intrusi_logs.findFirst({
      where: and(
        eq(intrusi_logs.device_id, device_id),
        inArray(intrusi_logs.event_type, ['DISARM', 'SIREN_SILENCED']),
        gt(intrusi_logs.timestamp, latestAlarm.timestamp!)
      ),
      orderBy: [desc(intrusi_logs.timestamp)]
    });

    if (clearingEvent || currentSystemState === 'DISARMED') {
      status = 'AMAN';
    } else {
      status = 'BAHAYA';
    }
  }

  const latestImpact = await db.query.intrusi_logs.findFirst({
    where: and(
      eq(intrusi_logs.device_id, device_id),
      eq(intrusi_logs.event_type, 'IMPACT_WARNING')
    ),
    orderBy: [desc(intrusi_logs.timestamp)]
  });

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
  const existing = await db.query.intrusi_logs.findFirst({
    where: eq(intrusi_logs.id, logId)
  });
  if (!existing) throw new ApiError(404, 'Log intrusi tidak ditemukan.');

  const [updated] = await db
    .update(intrusi_logs)
    .set({
      status,
      notes: notes || existing.notes,
      acknowledged_by: userId,
      acknowledged_at: new Date()
    })
    .where(eq(intrusi_logs.id, logId))
    .returning();

  return updated;
};
