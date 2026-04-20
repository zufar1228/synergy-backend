"use strict";
/**
 * @file lingkunganRoutes.ts
 * @purpose Express router for lingkungan endpoints with Zod validation
 * @usedBy server.ts
 * @deps lingkunganController, authMiddleware, validateRequest, zod
 * @exports default router
 * @sideEffects None
 */
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
const lingkunganController = __importStar(require("../controllers/lingkunganController"));
const validateRequest_1 = require("../../../api/middlewares/validateRequest");
const authMiddleware_1 = require("../../../api/middlewares/authMiddleware");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const adminOnly = (0, authMiddleware_1.roleBasedAuth)(['admin', 'super_admin']);
// === Zod Schema: Manual control command validation ===
const controlCommandSchema = zod_1.z.object({
    body: zod_1.z
        .object({
        fan: zod_1.z.enum(['ON', 'OFF']).optional(),
        dehumidifier: zod_1.z.enum(['ON', 'OFF']).optional(),
        mode: zod_1.z.enum(['AUTO', 'MANUAL']).optional()
    })
        .refine((data) => data.fan || data.dehumidifier || data.mode, {
        message: 'Harus menyertakan setidaknya satu perintah (fan, dehumidifier, atau mode).'
    })
});
// Device-level endpoints
router.get('/devices/:deviceId/logs', lingkunganController.getLogs);
router.get('/devices/:deviceId/summary', lingkunganController.getSummary);
router.get('/devices/:deviceId/status', lingkunganController.getStatus);
router.get('/devices/:deviceId/chart', lingkunganController.getChartData);
// POST /api/lingkungan/control — Manual control (fan, dehumidifier)
router.post('/devices/:deviceId/control', adminOnly, (0, validateRequest_1.validate)(controlCommandSchema), lingkunganController.sendControlCommand);
// Log acknowledgement
router.put('/logs/:id/status', adminOnly, lingkunganController.updateStatus);
exports.default = router;
