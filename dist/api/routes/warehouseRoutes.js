"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/api/routes/warehouseRoutes.ts
const express_1 = require("express");
const warehouseController = __importStar(require("../controllers/warehouseController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
const adminOnly = (0, authMiddleware_1.roleBasedAuth)(["admin", "super_admin"]);
// Rute GET bisa diakses semua pengguna yang login
router.get("/", warehouseController.listWarehouses);
router.get("/:id", warehouseController.getWarehouseById);
router.get("/:id/areas-with-systems", warehouseController.getAreasWithSystems);
// Rute POST, PUT, DELETE hanya untuk admin
router.post("/", adminOnly, warehouseController.createWarehouse);
router.put("/:id", adminOnly, warehouseController.updateWarehouse);
router.delete("/:id", adminOnly, warehouseController.deleteWarehouse);
exports.default = router;
