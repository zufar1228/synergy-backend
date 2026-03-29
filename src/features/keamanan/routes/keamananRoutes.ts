// backend/src/api/routes/keamananRoutes.ts
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
