"use strict";
/**
 * @file telegramAdminController.ts
 * @purpose HTTP handlers for Telegram bot admin operations (invite, kick, webhook)
 * @usedBy telegramRoutes.ts
 * @deps telegramService, db/drizzle, ApiError, time util
 * @exports createInvite, kickSubscriber, getSubscribers, getWebhookInfo, setupWebhook, sendTestAlert
 * @sideEffects DB read/write (telegram_subscribers), Telegram API calls
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestAlert = exports.setupWebhook = exports.getWebhookInfo = exports.getSubscribers = exports.kickSubscriber = exports.createInvite = void 0;
const telegramService = __importStar(require("../../services/telegramService"));
const drizzle_1 = require("../../db/drizzle");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../../utils/apiError"));
const time_1 = require("../../utils/time");
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
const createInvite = async (req, res) => {
    try {
        const result = await telegramService.createSingleUseInviteLink();
        res.json({
            success: true,
            invite_link: result.invite_link,
            expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
            member_limit: 1,
        });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.createInvite = createInvite;
const kickSubscriber = async (req, res) => {
    try {
        const { user_id } = req.body;
        if (!user_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID wajib diisi'
            });
        }
        const telegramUserId = parseInt(user_id, 10);
        if (isNaN(telegramUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID harus berupa angka'
            });
        }
        const success = await telegramService.kickMember(telegramUserId);
        if (success) {
            await drizzle_1.db
                .update(schema_1.telegram_subscribers)
                .set({ status: 'kicked', kicked_at: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.telegram_subscribers.user_id, telegramUserId));
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
const getSubscribers = async (req, res) => {
    try {
        const { include_inactive, status } = req.query;
        let whereClause;
        if (status && typeof status === 'string') {
            whereClause = (0, drizzle_orm_1.eq)(schema_1.telegram_subscribers.status, status);
        }
        else if (include_inactive !== 'true') {
            whereClause = (0, drizzle_orm_1.eq)(schema_1.telegram_subscribers.status, 'active');
        }
        const subscribers = await drizzle_1.db.query.telegram_subscribers.findMany({
            where: whereClause,
            orderBy: [(0, drizzle_orm_1.desc)(schema_1.telegram_subscribers.joined_at)],
            columns: {
                user_id: true,
                username: true,
                first_name: true,
                status: true,
                joined_at: true,
                left_at: true,
                kicked_at: true
            }
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
const getWebhookInfo = async (req, res) => {
    try {
        const info = await telegramService.getWebhookInfo();
        if (info) {
            res.json({ success: true, data: info });
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
const setupWebhook = async (req, res) => {
    try {
        const success = await telegramService.setWebhook();
        if (success) {
            res.json({ success: true, message: 'Webhook berhasil di-setup' });
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
const sendTestAlert = async (req, res) => {
    try {
        const timestamp = (0, time_1.formatTimestampWIB)();
        const testMessage = `
<b>TEST ALERT</b>

Ini adalah pesan tes dari sistem monitoring.
Dikirim oleh: ${req.user?.email || 'Unknown'}
Waktu: ${timestamp}

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
