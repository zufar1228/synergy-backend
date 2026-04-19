/**
 * @file analyticsRoutes.ts
 * @purpose Express router for analytics endpoints
 * @usedBy server.ts
 * @deps analyticsController
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as analyticsController from '../controllers/analyticsController';

const router = Router();

// Kita tidak perlu validasi Zod yang rumit di sini karena semua query bersifat opsional
router.get('/:system_type', analyticsController.getAnalytics);

export default router;
