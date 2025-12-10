"use strict";
// backend/src/api/controllers/deviceController.ts
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
exports.sendManualCommand = exports.getDeviceDetailsByArea = exports.deleteDevice = exports.updateDevice = exports.createDevice = exports.getDeviceById = exports.listDevices = void 0;
const deviceService = __importStar(require("../../services/deviceService"));
const actuationService = __importStar(require("../../services/actuationService")); // <-- IMPORT ACTUATION SERVICE
const apiError_1 = __importDefault(require("../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error("Unhandled Error:", error);
    return res.status(500).json({ message: "An unexpected error occurred." });
};
const listDevices = async (_req, res) => {
    try {
        const data = await deviceService.getAllDevices();
        res.status(200).json(data);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.listDevices = listDevices;
const getDeviceById = async (req, res) => {
    try {
        const data = await deviceService.getDeviceById(req.params.id);
        res.status(200).json(data);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getDeviceById = getDeviceById;
const createDevice = async (req, res) => {
    try {
        const result = await deviceService.createDevice(req.body);
        res.status(201).json(result);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.createDevice = createDevice;
const updateDevice = async (req, res) => {
    try {
        const device = await deviceService.updateDevice(req.params.id, req.body);
        res.status(200).json(device);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateDevice = updateDevice;
const deleteDevice = async (req, res) => {
    try {
        await deviceService.deleteDevice(req.params.id);
        res.status(204).send();
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.deleteDevice = deleteDevice;
// --- TAMBAHKAN FUNGSI BARU INI ---
const getDeviceDetailsByArea = async (req, res) => {
    try {
        const { area_id, system_type } = req.query;
        // Validasi yang lebih strict
        if (typeof area_id !== "string" || typeof system_type !== "string") {
            throw new apiError_1.default(400, "Query parameter area_id dan system_type wajib berupa string.");
        }
        const data = await deviceService.getDeviceByAreaAndSystem(area_id, system_type);
        res.status(200).json(data);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getDeviceDetailsByArea = getDeviceDetailsByArea;
// --- TAMBAHKAN FUNGSI BARU INI ---
const sendManualCommand = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // Sudah divalidasi oleh Zod
        // ❌ Hapus validasi manual ini (sudah ditangani Zod)
        // if (!action || !['On', 'Off'].includes(action)) {
        //   throw new ApiError(400, 'Aksi tidak valid. Kirim "On" atau "Off".');
        // }
        await actuationService.controlFanRelay(id, action);
        res.status(200).json({
            message: `Perintah manual '${action}' berhasil dikirim.`,
            device_id: id,
            action: action,
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.sendManualCommand = sendManualCommand;
