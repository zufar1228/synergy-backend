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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStatus = exports.sendControlCommand = exports.getChartData = exports.getStatus = exports.getSummary = exports.getLogs = void 0;
const lingkunganService = __importStar(require("../services/lingkunganService"));
const apiError_1 = __importDefault(require("../../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Unhandled Error in LingkunganController:', error);
    return res
        .status(500)
        .json({ message: 'An unexpected internal server error occurred.' });
};
/**
 * GET /api/lingkungan/devices/:deviceId/logs
 */
const getLogs = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit, offset, from, to } = req.query;
        const result = await lingkunganService.getLingkunganLogs({
            device_id: deviceId,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
            from: from,
            to: to
        });
        res.status(200).json(result);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getLogs = getLogs;
/**
 * GET /api/lingkungan/devices/:deviceId/summary
 */
const getSummary = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { from, to } = req.query;
        const data = await lingkunganService.getLingkunganSummary(deviceId, from, to);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSummary = getSummary;
/**
 * GET /api/lingkungan/devices/:deviceId/status
 */
const getStatus = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await lingkunganService.getLingkunganStatus(deviceId);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getStatus = getStatus;
/**
 * GET /api/lingkungan/devices/:deviceId/chart
 */
const getChartData = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { from, to, limit } = req.query;
        console.log('[LingkunganController.getChartData]', {
            deviceId,
            from,
            to,
            limit,
            limitType: typeof limit
        });
        const data = await lingkunganService.getChartData(deviceId, from, to, limit ? parseInt(limit, 10) : undefined);
        console.log('[LingkunganController.getChartData] Sending response:', {
            actualCount: data.actual.length,
            predictionCount: data.predictions.length
        });
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getChartData = getChartData;
/**
 * POST /api/lingkungan/control
 * Manual control endpoint — sends fan/dehumidifier commands via MQTT.
 */
const sendControlCommand = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { fan, dehumidifier, mode } = req.body;
        // If switching to auto mode
        if (mode === 'AUTO') {
            await lingkunganService.switchToAutoMode(deviceId);
            return res.status(200).json({
                message: 'Beralih ke mode otomatis.',
                device_id: deviceId,
                mode: 'AUTO'
            });
        }
        // If switching to manual mode (without specific fan/dehumidifier commands)
        if (mode === 'MANUAL' && !fan && !dehumidifier) {
            await lingkunganService.handleManualControl(deviceId, {});
            return res.status(200).json({
                message: 'Mode manual diaktifkan (5 menit).',
                device_id: deviceId,
                mode: 'MANUAL',
                override_duration: '5 menit'
            });
        }
        // Manual control with specific actuator commands (Level 1 — highest priority)
        const command = {};
        if (fan)
            command.fan = fan;
        if (dehumidifier)
            command.dehumidifier = dehumidifier;
        await lingkunganService.handleManualControl(deviceId, command);
        res.status(200).json({
            message: `Perintah manual berhasil dikirim.`,
            device_id: deviceId,
            command,
            mode: 'MANUAL',
            override_duration: '5 menit'
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.sendControlCommand = sendControlCommand;
/**
 * PUT /api/lingkungan/logs/:id/status
 */
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            throw new apiError_1.default(401, 'User tidak terautentikasi.');
        }
        const validStatuses = [
            'unacknowledged',
            'acknowledged',
            'resolved',
            'false_alarm'
        ];
        if (!status || !validStatuses.includes(status)) {
            return res
                .status(400)
                .json({
                message: 'Status tidak valid. Harus salah satu dari: unacknowledged, acknowledged, resolved, false_alarm.'
            });
        }
        const updatedLog = await lingkunganService.updateLingkunganLogStatus(id, userId, status, notes);
        res.status(200).json(updatedLog);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateStatus = updateStatus;
