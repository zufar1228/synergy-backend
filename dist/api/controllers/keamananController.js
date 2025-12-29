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
exports.triggerRepeatDetection = exports.updateStatus = void 0;
const keamananService = __importStar(require("../../services/keamananService"));
const repeatDetectionService_1 = require("../../services/repeatDetectionService");
const apiError_1 = __importDefault(require("../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    // Log error yang tidak terduga untuk debugging
    console.error("Unhandled Error in KeamananController:", error);
    return res
        .status(500)
        .json({ message: "An unexpected internal server error occurred." });
};
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            throw new apiError_1.default(401, "User tidak terautentikasi.");
        }
        if (!status) {
            return res.status(400).json({ message: "Status wajib diisi." });
        }
        const updatedLog = await keamananService.updateKeamananLogStatus(id, userId, status, notes);
        res.status(200).json(updatedLog);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateStatus = updateStatus;
const triggerRepeatDetection = async (req, res) => {
    try {
        console.log("[KeamananController] Triggering repeat detection notifications...");
        await (0, repeatDetectionService_1.findAndNotifyRepeatDetections)();
        res.status(200).json({ message: "Repeat detection notifications triggered successfully" });
    }
    catch (error) {
        console.error("[KeamananController] Error triggering repeat detection:", error);
        handleError(res, error);
    }
};
exports.triggerRepeatDetection = triggerRepeatDetection;
