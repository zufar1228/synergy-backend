// backend/src/api/routes/proteksiAsetRoutes.ts

import { Router } from "express";
import * as proteksiAsetController from "../controllers/proteksiAsetController";

const router = Router();

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

export default router;
