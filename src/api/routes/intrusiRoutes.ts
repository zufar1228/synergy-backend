// backend/src/api/routes/intrusiRoutes.ts
import { Router } from "express";
import * as intrusiController from "../controllers/intrusiController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/devices/:deviceId/intrusi/logs - Get intrusion logs with pagination
router.get("/devices/:deviceId/intrusi/logs", intrusiController.getIntrusiLogs);

// GET /api/devices/:deviceId/intrusi/summary - Get intrusion summary statistics
router.get("/devices/:deviceId/intrusi/summary", intrusiController.getIntrusiSummary);

// GET /api/devices/:deviceId/intrusi/status - Get current intrusion status
router.get("/devices/:deviceId/intrusi/status", intrusiController.getIntrusiStatus);

export default router;
