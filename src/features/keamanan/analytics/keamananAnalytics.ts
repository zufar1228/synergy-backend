/**
 * @file keamananAnalytics.ts
 * @purpose Analytics query builder for keamanan logs (paginated, filterable)
 * @usedBy analyticsService
 * @deps db/drizzle, schema (keamanan_logs, devices)
 * @exports keamananAnalyticsConfig
 * @sideEffects DB read (keamanan_logs)
 */

import { db } from '../../../db/drizzle';
import { keamanan_logs, devices } from '../../../db/schema';
import { eq, and, gte, lte, inArray, count, desc, type SQL } from 'drizzle-orm';
import type { AnalyticsConfig, AnalyticsQuery } from '../../../services/analyticsService';

function buildConditions(query: AnalyticsQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.status) conditions.push(inArray(keamanan_logs.status, query.status.split(',') as any));
  if (query.from) conditions.push(gte(keamanan_logs.created_at, new Date(query.from)));
  if (query.to) conditions.push(lte(keamanan_logs.created_at, new Date(query.to)));

  if (query.area_id) {
    conditions.push(
      inArray(
        keamanan_logs.device_id,
        db.select({ id: devices.id }).from(devices).where(eq(devices.area_id, query.area_id))
      )
    );
  }

  return conditions;
}

export const keamananAnalyticsConfig: AnalyticsConfig = {
  getLogsAndCount: async (query, limit, offset) => {
    const conditions = buildConditions(query);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: count() }).from(keamanan_logs).where(whereClause);
    const data = await db.query.keamanan_logs.findMany({
      where: whereClause,
      with: { device: { columns: { id: true, name: true } } },
      limit,
      offset,
      orderBy: [desc(keamanan_logs.created_at)]
    });

    return { count: Number(countResult.count), data };
  },

  getSummary: async (query) => {
    const conditions = buildConditions(query);
    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(keamanan_logs).where(baseWhere);
    const unackWhere = and(...conditions, eq(keamanan_logs.status, 'unacknowledged'));
    const [unackResult] = await db.select({ count: count() }).from(keamanan_logs).where(unackWhere);

    return {
      total_detections: Number(totalResult.count),
      unacknowledged_alerts: Number(unackResult.count)
    };
  }
};
