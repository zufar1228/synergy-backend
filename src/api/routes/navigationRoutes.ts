// backend/src/api/routes/navigationRoutes.ts
import { Router } from "express";
import * as navigationController from "../controllers/navigationController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();

router.get(
  "/areas-by-system",
  authMiddleware,
  navigationController.listAreasBySystem
);

export default router;
