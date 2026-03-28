// backend/src/api/routes/intrusiRoutes.ts
import { Router } from 'express';
import * as intrusiController from '../controllers/intrusiController';
import { validate } from '../../../api/middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

// === Zod Schema: Intrusi command validation ===
const intrusiCommandSchema = z.object({
  body: z.discriminatedUnion('cmd', [
    z.object({ cmd: z.literal('ARM') }),
    z.object({ cmd: z.literal('DISARM') }),
    z.object({
      cmd: z.literal('SIREN_SILENCE'),
      issued_by: z.string().optional()
    }),
    z.object({ cmd: z.literal('STATUS') })
  ])
});

// Device-level endpoints
router.get('/devices/:deviceId/logs', intrusiController.getLogs);
router.get('/devices/:deviceId/summary', intrusiController.getSummary);
router.get('/devices/:deviceId/status', intrusiController.getStatus);

// Send command to intrusi device (ARM, DISARM, SIREN_SILENCE, STATUS)
router.post(
  '/devices/:deviceId/command',
  validate(intrusiCommandSchema),
  intrusiController.sendCommand
);

// Log status update (acknowledgement)
router.put('/logs/:id/status', intrusiController.updateStatus);

export default router;
