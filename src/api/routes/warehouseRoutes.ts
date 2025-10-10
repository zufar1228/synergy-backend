// backend/src/api/routes/warehouseRoutes.ts
import { Router } from "express";
import * as warehouseController from "../controllers/warehouseController";
import { roleBasedAuth } from "../middlewares/authMiddleware";

const router = Router();
const adminOnly = roleBasedAuth(["admin", "super_admin"]);

// Rute GET bisa diakses semua pengguna yang login
router.get("/", warehouseController.listWarehouses);
router.get("/:id", warehouseController.getWarehouseById);
router.get("/:id/areas-with-systems", warehouseController.getAreasWithSystems);

// Rute POST, PUT, DELETE hanya untuk admin
router.post("/", adminOnly, warehouseController.createWarehouse);
router.put("/:id", adminOnly, warehouseController.updateWarehouse);
router.delete("/:id", adminOnly, warehouseController.deleteWarehouse);

export default router;
