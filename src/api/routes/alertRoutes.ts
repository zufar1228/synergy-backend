// backend/src/api/routes/alertRoutes.ts
import { Router } from "express";
import * as alertController from "../controllers/alertController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get("/active", authMiddleware, alertController.listActiveAlerts);

export default router;
