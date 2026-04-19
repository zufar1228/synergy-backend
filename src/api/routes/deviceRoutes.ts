/**
 * @file deviceRoutes.ts
 * @purpose Express router for device CRUD endpoints with Zod validation
 * @usedBy server.ts
 * @deps deviceController, authMiddleware, validateRequest, zod
 * @exports default router
 * @sideEffects None
 */


import { Router } from 'express';
import * as deviceController from '../controllers/deviceController';
import { validate } from '../middlewares/validateRequest';
import { roleBasedAuth } from '../middlewares/authMiddleware';
import { z } from 'zod';

const router = Router();
const adminOnly = roleBasedAuth(['admin', 'super_admin']);

// Daftar tipe sistem yang kita izinkan
const systemTypes = z.enum(['keamanan', 'intrusi', 'lingkungan']);

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: 'Nama wajib diisi.' }),
    area_id: z
      .string()
      .uuid({ message: 'Area ID harus berupa UUID yang valid.' }),
    system_type: systemTypes // <-- PERUBAHAN DI SINI
  })
});

const updateDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    area_id: z.string().uuid().optional()
    // Tipe sistem tidak boleh diubah saat update, jadi kita hapus dari skema update
  })
});

// Daftarkan semua endpoint

// Rute ini harus di atas rute '/:id' agar 'details' tidak dianggap sebagai ID
router.get('/details', deviceController.getDeviceDetailsByArea);

// Rute yang sudah ada
router.get('/', deviceController.listDevices);
router.post(
  '/',
  adminOnly,
  validate(createDeviceSchema),
  deviceController.createDevice
);
router.get('/:id', deviceController.getDeviceById);
router.put(
  '/:id',
  adminOnly,
  validate(updateDeviceSchema),
  deviceController.updateDevice
);
router.delete('/:id', adminOnly, deviceController.deleteDevice);

export default router;
