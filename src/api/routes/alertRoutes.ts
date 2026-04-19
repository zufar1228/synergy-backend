/**
 * @file alertRoutes.ts
 * @purpose Express router for alert endpoints
 * @usedBy server.ts
 * @deps alertController
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as alertController from '../controllers/alertController';

const router = Router();

router.get('/active', alertController.listActiveAlerts);

export default router;
