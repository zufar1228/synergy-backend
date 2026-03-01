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
// backend/src/api/routes/intrusiRoutes.ts
const express_1 = require("express");
const intrusiController = __importStar(require("../controllers/intrusiController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validateRequest_1 = require("../middlewares/validateRequest");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
// === Zod Schema: Intrusi command validation ===
const intrusiCommandSchema = zod_1.z.object({
    body: zod_1.z.discriminatedUnion('cmd', [
        zod_1.z.object({ cmd: zod_1.z.literal('ARM') }),
        zod_1.z.object({ cmd: zod_1.z.literal('DISARM') }),
        zod_1.z.object({
            cmd: zod_1.z.literal('CALIB_KNOCK_START'),
            n_hits: zod_1.z.number().int().min(3).max(15).optional(),
            timeout_ms: zod_1.z.number().int().min(10000).max(300000).optional()
        }),
        zod_1.z.object({
            cmd: zod_1.z.literal('SIREN_SILENCE'),
            issued_by: zod_1.z.string().optional()
        }),
        zod_1.z.object({ cmd: zod_1.z.literal('STATUS') })
    ])
});
// Device-level endpoints
router.get('/devices/:deviceId/logs', authMiddleware_1.authMiddleware, intrusiController.getLogs);
router.get('/devices/:deviceId/summary', authMiddleware_1.authMiddleware, intrusiController.getSummary);
router.get('/devices/:deviceId/status', authMiddleware_1.authMiddleware, intrusiController.getStatus);
// Send command to intrusi device (ARM, DISARM, CALIB, SIREN_SILENCE, STATUS)
router.post('/devices/:deviceId/command', authMiddleware_1.authMiddleware, (0, validateRequest_1.validate)(intrusiCommandSchema), intrusiController.sendCommand);
// Log status update (acknowledgement)
router.put('/logs/:id/status', authMiddleware_1.authMiddleware, intrusiController.updateStatus);
exports.default = router;
