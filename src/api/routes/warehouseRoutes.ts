/**
 * @file warehouseRoutes.ts
 * @purpose Express router for warehouse CRUD endpoints with Zod validation
 * @usedBy server.ts
 * @deps warehouseController, authMiddleware, validateRequest, zod
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import { z } from 'zod';
import * as warehouseController from '../controllers/warehouseController';
import { roleBasedAuth } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateRequest';

const router = Router();
const adminOnly = roleBasedAuth(['admin', 'super_admin']);

const createWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Nama gudang wajib diisi.' }),
    location: z.string().optional()
  })
});

const updateWarehouseSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Nama gudang wajib diisi.' }).optional(),
    location: z.string().optional()
  }),
  params: z.object({
    id: z.string().uuid({ message: 'ID harus berupa UUID yang valid.' })
  })
});

// Rute GET bisa diakses semua pengguna yang login
router.get('/', warehouseController.listWarehouses);
router.get('/:id', warehouseController.getWarehouseById);
router.get('/:id/areas-with-systems', warehouseController.getAreasWithSystems);

// Rute POST, PUT, DELETE hanya untuk admin
router.post(
  '/',
  adminOnly,
  validate(createWarehouseSchema),
  warehouseController.createWarehouse
);
router.put(
  '/:id',
  adminOnly,
  validate(updateWarehouseSchema),
  warehouseController.updateWarehouse
);
router.delete('/:id', adminOnly, warehouseController.deleteWarehouse);

export default router;
