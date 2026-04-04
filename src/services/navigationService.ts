import { db } from '../db/drizzle';
import { areas, devices, warehouses } from '../db/schema';
import { eq, asc } from 'drizzle-orm';

export const getAreasBySystemType = async (systemType: string) => {
  const result = await db
    .selectDistinct({
      id: areas.id,
      name: areas.name,
      warehouse_id: areas.warehouse_id,
      warehouse_name: warehouses.name
    })
    .from(areas)
    .innerJoin(devices, eq(areas.id, devices.area_id))
    .innerJoin(warehouses, eq(areas.warehouse_id, warehouses.id))
    .where(eq(devices.system_type, systemType))
    .orderBy(asc(areas.name));
  return result;
};
