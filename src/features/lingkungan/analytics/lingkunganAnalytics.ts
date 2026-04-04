import { db } from '../../../db/drizzle';
import { lingkungan_logs, devices } from '../../../db/schema';
import { eq, and, gte, lte, inArray, count, desc, type SQL } from 'drizzle-orm';
import type { AnalyticsConfig, AnalyticsQuery } from '../../../services/analyticsService';

function buildConditions(query: AnalyticsQuery): SQL[] {
  const conditions: SQL[] = [];

  if (query.status) conditions.push(inArray(lingkungan_logs.status, query.status.split(',') as any));
  if (query.from) conditions.push(gte(lingkungan_logs.timestamp, new Date(query.from)));
  if (query.to) conditions.push(lte(lingkungan_logs.timestamp, new Date(query.to)));

  if (query.area_id) {
    conditions.push(
      inArray(
        lingkungan_logs.device_id,
        db.select({ id: devices.id }).from(devices).where(eq(devices.area_id, query.area_id))
      )
    );
  }

  return conditions;
}

export const lingkunganAnalyticsConfig: AnalyticsConfig = {
  getLogsAndCount: async (query, limit, offset) => {
    const conditions = buildConditions(query);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: count() }).from(lingkungan_logs).where(whereClause);
    const data = await db.query.lingkungan_logs.findMany({
      where: whereClause,
      with: { device: { columns: { id: true, name: true } } },
      limit,
      offset,
      orderBy: [desc(lingkungan_logs.timestamp)]
    });

    return { count: Number(countResult.count), data };
  },

  getSummary: async (query) => {
    const conditions = buildConditions(query);
    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db.select({ count: count() }).from(lingkungan_logs).where(baseWhere);
    const unackWhere = and(...conditions, eq(lingkungan_logs.status, 'unacknowledged'));
    const [unackResult] = await db.select({ count: count() }).from(lingkungan_logs).where(unackWhere);

    return {
      total_readings: Number(totalResult.count),
      unacknowledged: Number(unackResult.count)
    };
  }
};
