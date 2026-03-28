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
exports.startRepeatDetectionJob = void 0;
// backend/src/jobs/repeatDetectionJob.ts
const node_cron_1 = __importDefault(require("node-cron"));
const repeatDetectionService = __importStar(require("../services/repeatDetectionService"));
const checkRepeatDetections = async () => {
    console.log("[Cron Job] Menjalankan pemeriksaan deteksi berulang...");
    try {
        // Panggil service yang sudah kita buat
        await repeatDetectionService.findAndNotifyRepeatDetections();
    }
    catch (error) {
        console.error("[Cron Job] Error saat memeriksa deteksi berulang:", error);
    }
};
// Jadwalkan untuk berjalan setiap menit: '*/1 * * * *'
const startRepeatDetectionJob = () => {
    node_cron_1.default.schedule("*/1 * * * *", checkRepeatDetections);
    console.log("[Cron Job] Penjadwalan deteksi berulang (setiap menit) telah aktif.");
};
exports.startRepeatDetectionJob = startRepeatDetectionJob;
