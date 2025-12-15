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
exports.sendTestAlert = exports.setupWebhook = exports.getWebhookInfo = exports.getSubscribers = exports.kickSubscriber = exports.createInvite = void 0;
const telegramService = __importStar(require("../../services/telegramService"));
const models_1 = require("../../db/models");
const apiError_1 = __importDefault(require("../../utils/apiError"));
/**
 * Handle errors consistently
 */
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message
        });
    }
    console.error('[TelegramAdmin] Unhandled error:', error);
    return res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan internal server'
    });
};
/**
 * 1. Generate single-use invite link
 * POST /api/telegram/invite
 */
const createInvite = async (req, res) => {
    try {
        const result = await telegramService.createSingleUseInviteLink();
        res.json({
            success: true,
            invite_link: result.invite_link,
            expires_at: new Date(Date.now() + 600 * 1000).toISOString(), // 10 minutes
            member_limit: 1,
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.createInvite = createInvite;
/**
 * 2. Kick member from Telegram group
 * POST /api/telegram/kick
 * Body: { user_id: number }
 */
const kickSubscriber = async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID wajib diisi'
            });
        }
        // Validate user_id is a number
        const telegramUserId = parseInt(user_id, 10);
        if (isNaN(telegramUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID harus berupa angka'
            });
        }
        // Kick from Telegram group
        const success = await telegramService.kickMember(telegramUserId);
        if (success) {
            // Update local database
            await models_1.TelegramSubscriber.update({
                status: 'kicked',
                kicked_at: new Date()
            }, { where: { user_id: telegramUserId } });
            res.json({
                success: true,
                message: 'User berhasil di-kick dari grup Telegram'
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengeluarkan user via Telegram API'
            });
        }
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.kickSubscriber = kickSubscriber;
/**
 * 3. List all Telegram subscribers
 * GET /api/telegram/members?include_inactive=true
 */
const getSubscribers = async (req, res) => {
    try {
        const { include_inactive, status } = req.query;
        // Build where clause
        let whereClause = {};
        if (status && typeof status === 'string') {
            // Filter by specific status
            whereClause.status = status;
        }
        else if (include_inactive !== 'true') {
            // Default: only active members
            whereClause.status = 'active';
        }
        // If include_inactive=true, show all (no filter)
        const subscribers = await models_1.TelegramSubscriber.findAll({
            where: whereClause,
            order: [['joined_at', 'DESC']],
            attributes: ['user_id', 'username', 'first_name', 'status', 'joined_at', 'left_at', 'kicked_at'],
        });
        res.json({
            success: true,
            count: subscribers.length,
            data: subscribers
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getSubscribers = getSubscribers;
/**
 * 4. Get webhook info (for debugging)
 * GET /api/telegram/webhook-info
 */
const getWebhookInfo = async (req, res) => {
    try {
        const info = await telegramService.getWebhookInfo();
        if (info) {
            res.json({
                success: true,
                data: info
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengambil info webhook'
            });
        }
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getWebhookInfo = getWebhookInfo;
/**
 * 5. Manually trigger webhook setup
 * POST /api/telegram/setup-webhook
 */
const setupWebhook = async (req, res) => {
    try {
        const success = await telegramService.setWebhook();
        if (success) {
            res.json({
                success: true,
                message: 'Webhook berhasil di-setup'
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Gagal setup webhook. Periksa konfigurasi environment.'
            });
        }
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.setupWebhook = setupWebhook;
/**
 * 6. Send test alert to Telegram group
 * POST /api/telegram/test-alert
 */
const sendTestAlert = async (req, res) => {
    try {
        const testMessage = `
🧪 <b>TEST ALERT</b>

Ini adalah pesan tes dari sistem monitoring.
Dikirim oleh: ${req.user?.email || 'Unknown'}
Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB

<i>Jika Anda menerima pesan ini, integrasi Telegram berfungsi dengan baik.</i>
`;
        const success = await telegramService.sendGroupAlert(testMessage);
        if (success) {
            res.json({
                success: true,
                message: 'Pesan tes berhasil dikirim ke grup Telegram'
            });
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Gagal mengirim pesan tes. Periksa konfigurasi bot.'
            });
        }
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.sendTestAlert = sendTestAlert;
