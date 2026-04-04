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
exports.sendCommand = exports.updateStatus = exports.getStatus = exports.getSummary = exports.getLogs = void 0;
const intrusiService = __importStar(require("../services/intrusiService"));
const actuationService = __importStar(require("../services/actuationService"));
const apiError_1 = __importDefault(require("../../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Unhandled Error in IntrusiController:', error);
    return res
        .status(500)
        .json({ message: 'An unexpected internal server error occurred.' });
};
/**
 * GET /api/intrusi/devices/:deviceId/logs
 */
const getLogs = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit, offset, from, to, event_type } = req.query;
        const result = await intrusiService.getIntrusiLogs({
            device_id: deviceId,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
            from: from,
            to: to,
            event_type: event_type
        });
        res.status(200).json(result);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getLogs = getLogs;
/**
 * GET /api/intrusi/devices/:deviceId/summary
 */
const getSummary = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { from, to } = req.query;
        const data = await intrusiService.getIntrusiSummary(deviceId, from, to);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSummary = getSummary;
/**
 * GET /api/intrusi/devices/:deviceId/status
 */
const getStatus = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const data = await intrusiService.getIntrusiStatus(deviceId);
        res.status(200).json({ data });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getStatus = getStatus;
/**
 * PUT /api/intrusi/logs/:id/status
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
        const updatedLog = await intrusiService.updateIntrusiLogStatus(id, userId, status, notes);
        res.status(200).json(updatedLog);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateStatus = updateStatus;
/**
 * POST /api/intrusi/devices/:deviceId/command
 * Mengirim perintah ke perangkat intrusi (ARM, DISARM, SIREN_SILENCE, STATUS)
 */
const sendCommand = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const command = req.body; // Sudah divalidasi oleh Zod
        await actuationService.sendIntrusiCommand(deviceId, command);
        res.status(200).json({
            message: `Perintah '${command.cmd}' berhasil dikirim.`,
            device_id: deviceId,
            command: command.cmd
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.sendCommand = sendCommand;
