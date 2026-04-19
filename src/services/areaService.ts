/**
 * @file areaService.ts
 * @purpose CRUD operations for areas with warehouse validation
 * @usedBy areaController
 * @deps db/drizzle, schema (areas, warehouses, devices), ApiError
 * @exports getAllAreas, createArea, updateArea, deleteArea, getAreasByWarehouse
 * @sideEffects DB read/write (areas)
 */

import { db } from '../db/drizzle';
import { areas, warehouses, devices } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import ApiError from '../utils/apiError';

interface AreaCreationAttributes {
  name: string;
  warehouse_id: string;
}

export const getAllAreas = async () => {
  return await db.query.areas.findMany({
    with: {
      warehouse: { columns: { id: true, name: true } }
    },
    orderBy: [asc(areas.name)]
  });
};

export const createArea = async (data: AreaCreationAttributes) => {
  const warehouse = await db.query.warehouses.findFirst({
    where: eq(warehouses.id, data.warehouse_id)
  });
  if (!warehouse) throw new ApiError(400, 'Warehouse ID tidak valid');

  const [area] = await db
    .insert(areas)
    .values({ warehouse_id: data.warehouse_id, name: data.name })
    .returning();
  return area;
};

export const updateArea = async (
  id: string,
  data: Partial<AreaCreationAttributes>
) => {
  const area = await db.query.areas.findFirst({ where: eq(areas.id, id) });
  if (!area) throw new ApiError(404, 'Area not found');

  if (data.warehouse_id) {
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, data.warehouse_id)
    });
    if (!warehouse) throw new ApiError(400, 'Warehouse ID tidak valid');
  }

  const [updated] = await db
    .update(areas)
    .set({ ...data, updated_at: new Date() })
    .where(eq(areas.id, id))
    .returning();
  return updated;
};

export const deleteArea = async (id: string) => {
  const area = await db.query.areas.findFirst({ where: eq(areas.id, id) });
  if (!area) throw new ApiError(404, 'Area not found');

  const childDevices = await db.query.devices.findMany({
    where: eq(devices.area_id, id),
    columns: { id: true }
  });
  if (childDevices.length > 0) {
    throw new ApiError(
      409,
      `Area ini masih memiliki ${childDevices.length} perangkat. Hapus perangkat terlebih dahulu.`
    );
  }

  await db.delete(areas).where(eq(areas.id, id));
};

export const getAreasByWarehouse = async (warehouseId: string) => {
  return await db.query.areas.findMany({
    where: eq(areas.warehouse_id, warehouseId),
    orderBy: [asc(areas.name)]
  });
};
