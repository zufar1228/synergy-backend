/**
 * @file intrusiAnalytics.ts
 * @purpose Analytics query builder for intrusi logs (paginated, filterable)
 * @usedBy analyticsService
 * @deps db/drizzle, schema (intrusi_logs, devices)
 * @exports intrusiAnalyticsConfig
 * @sideEffects DB read (intrusi_logs)
 */

import { db } from '../../../db/drizzle';
import { intrusi_logs, devices } from '../../../db/schema';
import { eq, and, gte, lte, inArray, count, desc, type SQL } from 'drizzle-orm';
import type { AnalyticsConfig, AnalyticsQuery } from '../../../services/analyticsService';

function buildConditions(query: AnalyticsQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.status) conditions.push(inArray(intrusi_logs.status, query.status.split(',') as any));
  if (query.event_type) conditions.push(inArray(intrusi_logs.event_type, query.event_type.split(',')));
  if (query.system_state) conditions.push(inArray(intrusi_logs.system_state, query.system_state.split(',')));
  if (query.door_state) conditions.push(inArray(intrusi_logs.door_state, query.door_state.split(',')));
  if (query.from) conditions.push(gte(intrusi_logs.timestamp, new Date(query.from)));
  if (query.to) conditions.push(lte(intrusi_logs.timestamp, new Date(query.to)));

  if (query.area_id) {
    conditions.push(
      inArray(
        intrusi_logs.device_id,
        db.select({ id: devices.id }).from(devices).where(eq(devices.area_id, query.area_id))
      )
    );
  }

  return conditions;
}

export const intrusiAnalyticsConfig: AnalyticsConfig = {
  getLogsAndCount: async (query, limit, offset) => {
    const conditions = buildConditions(query);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: count() }).from(intrusi_logs).where(whereClause);
    const data = await db.query.intrusi_logs.findMany({
      where: whereClause,
      with: { device: { columns: { id: true, name: true } } },
      limit,
      offset,
      orderBy: [desc(intrusi_logs.timestamp)]
    });

    return { count: Number(countResult.count), data };
  },

  getSummary: async (query) => {
    const conditions = buildConditions(query);
    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(intrusi_logs).where(baseWhere);

    const alarmWhere = and(...conditions, inArray(intrusi_logs.event_type, ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN']));
    const [alarmResult] = await db.select({ count: count() }).from(intrusi_logs).where(alarmWhere);

    const impactWhere = and(...conditions, eq(intrusi_logs.event_type, 'IMPACT_WARNING'));
    const [impactResult] = await db.select({ count: count() }).from(intrusi_logs).where(impactWhere);

    const unackWhere = and(...conditions, eq(intrusi_logs.status, 'unacknowledged'));
    const [unackResult] = await db.select({ count: count() }).from(intrusi_logs).where(unackWhere);

    return {
      total_events: Number(totalResult.count),
      alarm_events: Number(alarmResult.count),
      impact_warnings: Number(impactResult.count),
      unacknowledged: Number(unackResult.count)
    };
  }
};
