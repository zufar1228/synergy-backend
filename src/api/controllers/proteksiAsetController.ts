// backend/src/api/controllers/proteksiAsetController.ts

import { Request, Response, NextFunction } from "express";
import * as proteksiAsetService from "../../services/proteksiAsetService";
import ApiError from "../../utils/apiError";

/**
 * GET /api/proteksi-aset/logs
 * Ambil log berdasarkan area_id
 */
export const getLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { area_id, start_date, end_date, limit, offset } = req.query;

    if (!area_id || typeof area_id !== "string") {
      throw new ApiError(400, "area_id wajib diisi");
    }

    const options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {};

    if (start_date) options.startDate = new Date(start_date as string);
    if (end_date) options.endDate = new Date(end_date as string);
    if (limit) options.limit = parseInt(limit as string);
    if (offset) options.offset = parseInt(offset as string);

    const result = await proteksiAsetService.getLogsByArea(area_id, options);

    res.json({
      success: true,
      data: result.logs,
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proteksi-aset/stats/chart
 * Ambil statistik untuk chart (24 jam terakhir)
 */
export const getChartStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { area_id } = req.query;

    if (!area_id || typeof area_id !== "string") {
      throw new ApiError(400, "area_id wajib diisi");
    }

    const stats = await proteksiAsetService.getStatsForChart(area_id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proteksi-aset/summary
 * Ambil ringkasan insiden
 */
export const getSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { area_id } = req.query;

    if (!area_id || typeof area_id !== "string") {
      throw new ApiError(400, "area_id wajib diisi");
    }

    const summary = await proteksiAsetService.getSummary(area_id);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/proteksi-aset/status
 * Ambil status terkini area
 */
export const getStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { area_id } = req.query;

    if (!area_id || typeof area_id !== "string") {
      throw new ApiError(400, "area_id wajib diisi");
    }

    const status = await proteksiAsetService.getCurrentStatus(area_id);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/proteksi-aset/:id/clear
 * Clear (acknowledge) insiden
 */
export const clearIncident = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      throw new ApiError(400, "Incident ID wajib diisi");
    }

    const updatedLog = await proteksiAsetService.clearIncident(id);

    if (!updatedLog) {
      throw new ApiError(404, "Insiden tidak ditemukan");
    }

    res.json({
      success: true,
      message: "Insiden berhasil di-clear",
      data: updatedLog,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/proteksi-aset/logs
 * Simpan log manual (untuk testing)
 */
export const createLog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { device_id, incident_type, confidence, data } = req.body;

    if (!device_id) {
      throw new ApiError(400, "device_id wajib diisi");
    }

    if (!incident_type) {
      throw new ApiError(400, "incident_type wajib diisi");
    }

    const log = await proteksiAsetService.createLog(
      device_id,
      incident_type,
      confidence || null,
      {
        sensorId: device_id,
        type: "vibration",
        data: data?.raw_values || {},
      }
    );

    res.status(201).json({
      success: true,
      data: log,
    });
  } catch (error) {
    next(error);
  }
};
