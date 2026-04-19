/**
 * @file warehouseService.ts
 * @purpose CRUD operations for warehouses with area/device stats
 * @usedBy warehouseController
 * @deps db/drizzle, schema (warehouses, areas, devices), ApiError
 * @exports getWarehouseWithAreaSystems, getAllWarehousesWithStats, createWarehouse, updateWarehouse, deleteWarehouse
 * @sideEffects DB read/write (warehouses)
 */

import { db } from '../db/drizzle';
import { warehouses, areas, devices } from '../db/schema';
import type { WarehouseInsert } from '../db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import ApiError from '../utils/apiError';

export const getWarehouseWithAreaSystems = async (warehouseId: string) => {
  const warehouse = await db.query.warehouses.findFirst({
    where: eq(warehouses.id, warehouseId),
    with: {
      areas: {
        with: {
          devices: {
            columns: { system_type: true, status: true }
          }
        },
        orderBy: [asc(areas.name)]
      }
    }
  });

  if (!warehouse) {
    throw new ApiError(404, 'Warehouse not found');
  }

  // Count total and online devices in this warehouse
  const [deviceStats] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      online: sql<number>`cast(count(*) filter (where ${devices.status} = 'Online') as int)`
    })
    .from(devices)
    .innerJoin(areas, eq(devices.area_id, areas.id))
    .where(eq(areas.warehouse_id, warehouseId));

  const transformedAreas = warehouse.areas.map((area) => {
    const systemsMap = new Map<
      string,
      { device_count: number; status: string }
    >();

    area.devices.forEach((device) => {
      systemsMap.set(device.system_type, {
        device_count: 1,
        status: device.status
      });
    });

    const activeSystems = Array.from(systemsMap.entries()).map(
      ([type, data]) => ({
        system_type: type,
        device_count: data.device_count,
        status: data.status
      })
    );

    return { id: area.id, name: area.name, active_systems: activeSystems };
  });

  return {
    id: warehouse.id,
    name: warehouse.name,
    location: warehouse.location,
    areaCount: warehouse.areas.length,
    deviceCount: deviceStats?.total ?? 0,
    onlineDeviceCount: deviceStats?.online ?? 0,
    areas: transformedAreas
  };
};

export const getAllWarehousesWithStats = async () => {
  const result = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      location: warehouses.location,
      created_at: warehouses.created_at,
      updated_at: warehouses.updated_at,
      areaCount: sql<number>`cast((SELECT count(*) FROM areas WHERE areas.warehouse_id = "warehouses"."id") as int)`,
      deviceCount: sql<number>`cast((SELECT count(*) FROM devices JOIN areas ON devices.area_id = areas.id WHERE areas.warehouse_id = "warehouses"."id") as int)`,
      onlineDeviceCount: sql<number>`cast((SELECT count(*) FROM devices JOIN areas ON devices.area_id = areas.id WHERE areas.warehouse_id = "warehouses"."id" AND devices.status = 'Online') as int)`
    })
    .from(warehouses)
    .orderBy(asc(warehouses.name));
  return result;
};

export const createWarehouse = async (data: WarehouseInsert) => {
  const [warehouse] = await db.insert(warehouses).values(data).returning();
  return warehouse;
};

export const updateWarehouse = async (
  id: string,
  data: Partial<WarehouseInsert>
) => {
  const warehouse = await db.query.warehouses.findFirst({
    where: eq(warehouses.id, id)
  });
  if (!warehouse) throw new ApiError(404, 'Warehouse not found');

  const [updated] = await db
    .update(warehouses)
    .set({ ...data, updated_at: new Date() })
    .where(eq(warehouses.id, id))
    .returning();
  return updated;
};

export const deleteWarehouse = async (id: string) => {
  const warehouse = await db.query.warehouses.findFirst({
    where: eq(warehouses.id, id)
  });
  if (!warehouse) throw new ApiError(404, 'Warehouse not found');

  const childAreas = await db.query.areas.findMany({
    where: eq(areas.warehouse_id, id),
    columns: { id: true }
  });
  if (childAreas.length > 0) {
    throw new ApiError(
      409,
      `Gudang ini masih memiliki ${childAreas.length} area. Hapus area terlebih dahulu.`
    );
  }

  await db.delete(warehouses).where(eq(warehouses.id, id));
};
