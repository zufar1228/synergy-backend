"use strict";
// backend/src/api/routes/proteksiAsetRoutes.ts
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
const express_1 = require("express");
const proteksiAsetController = __importStar(require("../controllers/proteksiAsetController"));
const router = (0, express_1.Router)();
/**
 * @route GET /api/proteksi-aset/logs
 * @desc Ambil log insiden berdasarkan area
 * @query area_id (required), start_date, end_date, limit, offset
 */
router.get("/logs", proteksiAsetController.getLogs);
/**
 * @route POST /api/proteksi-aset/logs
 * @desc Simpan log insiden manual (untuk testing)
 */
router.post("/logs", proteksiAsetController.createLog);
/**
 * @route GET /api/proteksi-aset/stats/chart
 * @desc Ambil statistik untuk chart (24 jam terakhir)
 * @query area_id (required)
 */
router.get("/stats/chart", proteksiAsetController.getChartStats);
/**
 * @route GET /api/proteksi-aset/summary
 * @desc Ambil ringkasan insiden (total & aktif)
 * @query area_id (required)
 */
router.get("/summary", proteksiAsetController.getSummary);
/**
 * @route GET /api/proteksi-aset/status
 * @desc Ambil status terkini area
 * @query area_id (required)
 */
router.get("/status", proteksiAsetController.getStatus);
/**
 * @route PATCH /api/proteksi-aset/:id/clear
 * @desc Clear (acknowledge) insiden
 */
router.patch("/:id/clear", proteksiAsetController.clearIncident);
exports.default = router;
