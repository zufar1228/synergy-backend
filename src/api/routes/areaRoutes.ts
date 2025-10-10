// backend/src/api/routes/areaRoutes.ts
import { Router } from "express";
import * as areaController from "../controllers/areaController";

const router = Router();

router.get("/", areaController.listAreas);
router.post("/", areaController.createArea);
router.put("/:id", areaController.updateArea);
router.delete("/:id", areaController.deleteArea);

export default router;
