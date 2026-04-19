/**
 * @file navigationRoutes.ts
 * @purpose Express router for sidebar navigation endpoint
 * @usedBy server.ts
 * @deps navigationController
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as navigationController from '../controllers/navigationController';

const router = Router();

router.get('/areas-by-system', navigationController.listAreasBySystem);

export default router;
