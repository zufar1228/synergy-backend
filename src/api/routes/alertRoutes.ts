// backend/src/api/routes/alertRoutes.ts
import { Router } from "express";
import * as alertController from "../controllers/alertController";

const router = Router();

router.get("/active", alertController.listActiveAlerts);

export default router;
