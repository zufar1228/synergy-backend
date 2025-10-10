import { Router } from "express";
import * as analyticsController from "../controllers/analyticsController";

const router = Router();
router.get(
  "/gangguan/summary-by-type",
  analyticsController.getIncidentSummaryByType
);

// Kita tidak perlu validasi Zod yang rumit di sini karena semua query bersifat opsional
router.get("/:system_type", analyticsController.getAnalytics);

export default router;
