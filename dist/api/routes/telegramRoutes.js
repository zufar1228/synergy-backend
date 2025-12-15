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
// backend/src/api/routes/telegramRoutes.ts
const express_1 = require("express");
const webhookController = __importStar(require("../controllers/telegramWebhookController"));
const adminController = __importStar(require("../controllers/telegramAdminController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Middleware untuk super_admin only
const superAdminOnly = (0, authMiddleware_1.roleBasedAuth)(['super_admin']);
// ============================================================================
// PUBLIC ENDPOINT - Webhook dari Telegram
// ============================================================================
// PENTING: Jangan pasang authMiddleware di sini karena Telegram yang memanggil
router.post('/webhook', webhookController.handleWebhook);
// ============================================================================
// PROTECTED ENDPOINTS - Admin Management
// ============================================================================
// Generate invite link (sekali pakai, expire 10 menit)
router.post('/invite', authMiddleware_1.authMiddleware, superAdminOnly, adminController.createInvite);
// Kick member dari grup Telegram
router.post('/kick', authMiddleware_1.authMiddleware, superAdminOnly, adminController.kickSubscriber);
// List semua subscribers
router.get('/members', authMiddleware_1.authMiddleware, superAdminOnly, adminController.getSubscribers);
// Get webhook info (debugging)
router.get('/webhook-info', authMiddleware_1.authMiddleware, superAdminOnly, adminController.getWebhookInfo);
// Manual webhook setup
router.post('/setup-webhook', authMiddleware_1.authMiddleware, superAdminOnly, adminController.setupWebhook);
// Send test alert
router.post('/test-alert', authMiddleware_1.authMiddleware, superAdminOnly, adminController.sendTestAlert);
exports.default = router;
