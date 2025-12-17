"use strict";
// backend/src/api/controllers/proteksiAsetController.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLog = exports.clearIncident = exports.getStatus = exports.getSummary = exports.getChartStats = exports.getLogs = void 0;
const proteksiAsetService = __importStar(require("../../services/proteksiAsetService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
/**
 * GET /api/proteksi-aset/logs
 * Ambil log berdasarkan area_id
 */
const getLogs = async (req, res, next) => {
    try {
        const { area_id, start_date, end_date, limit, offset } = req.query;
        if (!area_id || typeof area_id !== "string") {
            throw new apiError_1.default(400, "area_id wajib diisi");
        }
        const options = {};
        if (start_date)
            options.startDate = new Date(start_date);
        if (end_date)
            options.endDate = new Date(end_date);
        if (limit)
            options.limit = parseInt(limit);
        if (offset)
            options.offset = parseInt(offset);
        const result = await proteksiAsetService.getLogsByArea(area_id, options);
        res.json({
            success: true,
            data: result.logs,
            total: result.total,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getLogs = getLogs;
/**
 * GET /api/proteksi-aset/stats/chart
 * Ambil statistik untuk chart (24 jam terakhir)
 */
const getChartStats = async (req, res, next) => {
    try {
        const { area_id } = req.query;
        if (!area_id || typeof area_id !== "string") {
            throw new apiError_1.default(400, "area_id wajib diisi");
        }
        const stats = await proteksiAsetService.getStatsForChart(area_id);
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getChartStats = getChartStats;
/**
 * GET /api/proteksi-aset/summary
 * Ambil ringkasan insiden
 */
const getSummary = async (req, res, next) => {
    try {
        const { area_id } = req.query;
        if (!area_id || typeof area_id !== "string") {
            throw new apiError_1.default(400, "area_id wajib diisi");
        }
        const summary = await proteksiAsetService.getSummary(area_id);
        res.json({
            success: true,
            data: summary,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getSummary = getSummary;
/**
 * GET /api/proteksi-aset/status
 * Ambil status terkini area
 */
const getStatus = async (req, res, next) => {
    try {
        const { area_id } = req.query;
        if (!area_id || typeof area_id !== "string") {
            throw new apiError_1.default(400, "area_id wajib diisi");
        }
        const status = await proteksiAsetService.getCurrentStatus(area_id);
        res.json({
            success: true,
            data: status,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getStatus = getStatus;
/**
 * PATCH /api/proteksi-aset/:id/clear
 * Clear (acknowledge) insiden
 */
const clearIncident = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            throw new apiError_1.default(400, "Incident ID wajib diisi");
        }
        const updatedLog = await proteksiAsetService.clearIncident(id);
        if (!updatedLog) {
            throw new apiError_1.default(404, "Insiden tidak ditemukan");
        }
        res.json({
            success: true,
            message: "Insiden berhasil di-clear",
            data: updatedLog,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.clearIncident = clearIncident;
/**
 * POST /api/proteksi-aset/logs
 * Simpan log manual (untuk testing)
 */
const createLog = async (req, res, next) => {
    try {
        const { device_id, incident_type, confidence, data } = req.body;
        if (!device_id) {
            throw new apiError_1.default(400, "device_id wajib diisi");
        }
        if (!incident_type) {
            throw new apiError_1.default(400, "incident_type wajib diisi");
        }
        const log = await proteksiAsetService.createLog(device_id, incident_type, confidence || null, {
            sensorId: device_id,
            type: "vibration",
            data: data?.raw_values || {},
        });
        res.status(201).json({
            success: true,
            data: log,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createLog = createLog;
