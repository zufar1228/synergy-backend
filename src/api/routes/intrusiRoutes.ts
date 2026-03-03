// backend/src/api/routes/intrusiRoutes.ts
import { Router } from 'express';
import * as intrusiController from '../controllers/intrusiController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { validate } from '../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

// === Zod Schema: Intrusi command validation ===
const intrusiCommandSchema = z.object({
  body: z.discriminatedUnion('cmd', [
    z.object({ cmd: z.literal('ARM') }),
    z.object({ cmd: z.literal('DISARM') }),
    z.object({ cmd: z.literal('CALIB_START') }),
    z.object({
      cmd: z.literal('CALIB_KNOCK_START'),
      n_hits: z.number().int().min(3).max(15).optional(),
      timeout_ms: z.number().int().min(10000).max(300000).optional()
    }),
    z.object({
      cmd: z.literal('SIREN_SILENCE'),
      issued_by: z.string().optional()
    }),
    z.object({ cmd: z.literal('STATUS') })
  ])
});

// Device-level endpoints
router.get(
  '/devices/:deviceId/logs',
  authMiddleware,
  intrusiController.getLogs
);
router.get(
  '/devices/:deviceId/summary',
  authMiddleware,
  intrusiController.getSummary
);
router.get(
  '/devices/:deviceId/status',
  authMiddleware,
  intrusiController.getStatus
);

// Send command to intrusi device (ARM, DISARM, CALIB, SIREN_SILENCE, STATUS)
router.post(
  '/devices/:deviceId/command',
  authMiddleware,
  validate(intrusiCommandSchema),
  intrusiController.sendCommand
);

// Log status update (acknowledgement)
router.put('/logs/:id/status', authMiddleware, intrusiController.updateStatus);

export default router;
