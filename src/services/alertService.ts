/**
 * @file alertService.ts
 * @purpose Queries active (unresolved) alerts across all system types for a warehouse
 * @usedBy alertController
 * @deps db/drizzle, schema (keamanan_logs, intrusi_logs, lingkungan_logs, devices)
 * @exports getActiveAlerts
 * @sideEffects DB read (multi-table query)
 */

import { db } from '../db/drizzle';
import { incidents, devices, areas } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const getActiveAlerts = async (warehouseId: string) => {
  const alerts = await db
    .selectDistinct({
      area_id: devices.area_id,
      system_type: devices.system_type
    })
    .from(incidents)
    .innerJoin(devices, eq(incidents.device_id, devices.id))
    .innerJoin(areas, eq(devices.area_id, areas.id))
    .where(
      and(
        eq(incidents.status, 'unacknowledged'),
        eq(areas.warehouse_id, warehouseId)
      )
    );

  return alerts;
};
