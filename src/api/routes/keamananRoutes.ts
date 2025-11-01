// backend/src/api/routes/keamananRoutes.ts
import { Router } from "express";
import * as keamananController from "../controllers/keamananController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();
router.put("/:id/status", authMiddleware, keamananController.updateStatus);
export default router;
