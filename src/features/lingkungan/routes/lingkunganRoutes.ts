/**
 * @file lingkunganRoutes.ts
 * @purpose Express router for lingkungan endpoints with Zod validation
 * @usedBy server.ts
 * @deps lingkunganController, authMiddleware, validateRequest, zod
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as lingkunganController from '../controllers/lingkunganController';
import { validate } from '../../../api/middlewares/validateRequest';
import { roleBasedAuth } from '../../../api/middlewares/authMiddleware';
import { z } from 'zod';

const router = Router();
const adminOnly = roleBasedAuth(['admin', 'super_admin']);

// === Zod Schema: Manual control command validation ===
const controlCommandSchema = z.object({
  body: z
    .object({
      fan: z.enum(['ON', 'OFF']).optional(),
      dehumidifier: z.enum(['ON', 'OFF']).optional(),
      mode: z.enum(['AUTO', 'MANUAL']).optional()
    })
    .refine((data) => data.fan || data.dehumidifier || data.mode, {
      message:
        'Harus menyertakan setidaknya satu perintah (fan, dehumidifier, atau mode).'
    })
});

// Device-level endpoints
router.get('/devices/:deviceId/logs', lingkunganController.getLogs);
router.get('/devices/:deviceId/summary', lingkunganController.getSummary);
router.get('/devices/:deviceId/status', lingkunganController.getStatus);
router.get('/devices/:deviceId/chart', lingkunganController.getChartData);

// POST /api/lingkungan/control — Manual control (fan, dehumidifier)
router.post(
  '/devices/:deviceId/control',
  adminOnly,
  validate(controlCommandSchema),
  lingkunganController.sendControlCommand
);

// Log acknowledgement
router.put('/logs/:id/status', adminOnly, lingkunganController.updateStatus);

export default router;
