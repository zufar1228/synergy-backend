// backend/src/api/routes/incidentRoutes.ts
import { Router } from "express";
import * as incidentController from "../controllers/incidentController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

// Endpoint ini dapat diakses oleh semua user yang login
router.put("/:id/status", authMiddleware, incidentController.updateStatus);

export default router;
