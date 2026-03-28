// backend/src/api/routes/navigationRoutes.ts
import { Router } from 'express';
import * as navigationController from '../controllers/navigationController';

const router = Router();

router.get('/areas-by-system', navigationController.listAreasBySystem);

export default router;
