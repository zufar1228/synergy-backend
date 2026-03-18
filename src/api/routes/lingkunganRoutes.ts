// backend/src/api/routes/lingkunganRoutes.ts
import { Router } from 'express';
import * as lingkunganController from '../controllers/lingkunganController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

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
router.get(
  '/devices/:deviceId/logs',
  authMiddleware,
  lingkunganController.getLogs
);
router.get(
  '/devices/:deviceId/summary',
  authMiddleware,
  lingkunganController.getSummary
);
router.get(
  '/devices/:deviceId/status',
  authMiddleware,
  lingkunganController.getStatus
);
router.get(
  '/devices/:deviceId/chart',
  authMiddleware,
  lingkunganController.getChartData
);

// POST /api/lingkungan/control — Manual control (fan, dehumidifier)
router.post(
  '/devices/:deviceId/control',
  authMiddleware,
  validate(controlCommandSchema),
  lingkunganController.sendControlCommand
);

// POST /api/lingkungan/devices/:deviceId/override-manual — Activate manual override
router.post(
  '/devices/:deviceId/override-manual',
  authMiddleware,
  lingkunganController.activateManualOverride
);

// POST /api/lingkungan/devices/:deviceId/override-auto — Switch back to auto mode
router.post(
  '/devices/:deviceId/override-auto',
  authMiddleware,
  lingkunganController.switchToAutoMode
);

// GET /api/lingkungan/devices/:deviceId/prediction-status — Get latest prediction + actuation reason
router.get(
  '/devices/:deviceId/prediction-status',
  authMiddleware,
  lingkunganController.getPredictionStatus
);

// Log acknowledgement
router.put(
  '/logs/:id/status',
  authMiddleware,
  lingkunganController.updateStatus
);

export default router;
