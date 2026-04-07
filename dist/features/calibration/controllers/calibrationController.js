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
exports.getSessionStats = exports.getStatistics = exports.getSummary = exports.getSessions = exports.getData = exports.getStatus = exports.sendCommand = void 0;
const calibrationService = __importStar(require("../services/calibrationService"));
const actuationService = __importStar(require("../services/calibrationActuationService"));
const handleError = (res, error) => {
    console.error('[CalibrationController] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
};
/**
 * POST /api-cal/command
 * Send a calibration command to a device via MQTT
 */
const sendCommand = async (req, res) => {
    try {
        const { deviceId, ...command } = req.body;
        if (!deviceId) {
            return res.status(400).json({ error: 'deviceId is required' });
        }
        if (!command.cmd) {
            return res.status(400).json({ error: 'cmd is required' });
        }
        await actuationService.sendCalibrationCommand(deviceId, command);
        res.status(200).json({
            message: `Command '${command.cmd}' sent successfully`,
            device_id: deviceId,
            command: command.cmd
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.sendCommand = sendCommand;
/**
 * GET /api-cal/status/:deviceId
 * Get latest calibration device status
 */
const getStatus = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await calibrationService.getDeviceStatus(deviceId);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getStatus = getStatus;
/**
 * GET /api-cal/data/:session? or /api-cal/data
 * Get raw calibration data, optionally filtered by session
 */
const getData = async (req, res) => {
    try {
        const session = req.params.session;
        const { trial, limit, offset } = req.query;
        const result = await calibrationService.getRawData({
            session: session || undefined,
            trial: trial ? parseInt(trial, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined
        });
        res.status(200).json(result);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getData = getData;
/**
 * GET /api-cal/sessions
 * Get distinct session names from raw data
 */
const getSessions = async (_req, res) => {
    try {
        const data = await calibrationService.getDistinctSessions();
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSessions = getSessions;
/**
 * GET /api-cal/summary
 * Get calibration summary data (Session A periodic summaries)
 */
const getSummary = async (req, res) => {
    try {
        const { session, trial, limit, offset } = req.query;
        const result = await calibrationService.getSummaryData({
            session: session,
            trial: trial ? parseInt(trial, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined
        });
        res.status(200).json(result);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSummary = getSummary;
/**
 * GET /api-cal/statistics
 * Get per-trial statistics
 */
const getStatistics = async (req, res) => {
    try {
        const { session } = req.query;
        const data = await calibrationService.getStatistics(session);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getStatistics = getStatistics;
/**
 * GET /api-cal/session-stats
 * Get per-session aggregate statistics
 */
const getSessionStats = async (req, res) => {
    try {
        const data = await calibrationService.getSessionStats();
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSessionStats = getSessionStats;
