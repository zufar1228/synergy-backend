/**
 * @file keamananRoutes.ts
 * @purpose Express router for keamanan endpoints (status update, repeat detection)
 * @usedBy server.ts
 * @deps keamananController, authMiddleware
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as keamananController from '../controllers/keamananController';
import { roleBasedAuth } from '../../../api/middlewares/authMiddleware';

const router = Router();
const adminOnly = roleBasedAuth(['admin', 'super_admin']);
router.put('/:id/status', adminOnly, keamananController.updateStatus);
router.post(
  '/trigger-repeat-detection',
  adminOnly,
  keamananController.triggerRepeatDetection
);
export default router;
