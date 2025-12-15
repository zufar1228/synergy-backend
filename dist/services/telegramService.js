"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteWebhook = exports.getWebhookInfo = exports.setWebhook = exports.kickMember = exports.createSingleUseInviteLink = exports.sendGroupAlert = void 0;
// backend/src/services/telegramService.ts
const axios_1 = __importDefault(require("axios"));
require("dotenv/config");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
/**
 * Helper untuk handle error axios dengan logging yang konsisten
 */
const handleError = (context, error) => {
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        console.error(`[TelegramService] ${context} Failed:`, axiosError.response?.data?.description || axiosError.message);
    }
    else if (error instanceof Error) {
        console.error(`[TelegramService] ${context} Error:`, error.message);
    }
    else {
        console.error(`[TelegramService] ${context} Unknown Error:`, error);
    }
    // Return null agar tidak mematikan flow utama
    return null;
};
/**
 * Validasi konfigurasi Telegram
 */
const validateConfig = () => {
    if (!BOT_TOKEN) {
        console.warn('[TelegramService] TELEGRAM_BOT_TOKEN not configured');
        return false;
    }
    if (!GROUP_ID) {
        console.warn('[TelegramService] TELEGRAM_GROUP_ID not configured');
        return false;
    }
    return true;
};
/**
 * 1. Kirim Alert ke Grup Telegram
 * Mendukung HTML formatting untuk pesan yang lebih menarik
 */
const sendGroupAlert = async (message) => {
    if (!validateConfig())
        return false;
    try {
        await axios_1.default.post(`${BASE_URL}/sendMessage`, {
            chat_id: GROUP_ID,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true, // Optimization: disable link previews for alerts
        });
        console.log('[TelegramService] Alert sent successfully.');
        return true;
    }
    catch (error) {
        handleError('sendGroupAlert', error);
        return false;
    }
};
exports.sendGroupAlert = sendGroupAlert;
/**
 * 2. Buat Invite Link Sekali Pakai (Expire 10 menit)
 * Berguna untuk mengundang user baru ke grup monitoring
 */
const createSingleUseInviteLink = async () => {
    if (!validateConfig()) {
        throw new Error('Telegram not configured');
    }
    try {
        const expireDate = Math.floor(Date.now() / 1000) + 600; // 10 menit dari sekarang
        const response = await axios_1.default.post(`${BASE_URL}/createChatInviteLink`, {
            chat_id: GROUP_ID,
            member_limit: 1,
            expire_date: expireDate,
            name: `Invite ${new Date().toISOString()}`, // Label untuk tracking
        });
        console.log('[TelegramService] Invite link created:', response.data.result.invite_link);
        return response.data.result;
    }
    catch (error) {
        handleError('createInviteLink', error);
        throw new Error('Gagal membuat link undangan Telegram');
    }
};
exports.createSingleUseInviteLink = createSingleUseInviteLink;
/**
 * 3. Kick Member dari Grup (Ban lalu Unban agar bisa join lagi nanti)
 * Menggunakan Promise-based unban dengan retry logic
 */
const kickMember = async (userId) => {
    if (!validateConfig())
        return false;
    try {
        // Ban (Kick) member
        await axios_1.default.post(`${BASE_URL}/banChatMember`, {
            chat_id: GROUP_ID,
            user_id: userId,
        });
        console.log(`[TelegramService] User ${userId} banned from group.`);
        // Unban setelah delay singkat (agar user bisa diinvite lagi di masa depan)
        // Menggunakan Promise-based approach yang lebih clean
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
            await axios_1.default.post(`${BASE_URL}/unbanChatMember`, {
                chat_id: GROUP_ID,
                user_id: userId,
                only_if_banned: true,
            });
            console.log(`[TelegramService] User ${userId} unbanned (can be re-invited).`);
        }
        catch (unbanError) {
            // Unban failure is not critical - user is still kicked
            console.warn(`[TelegramService] Unban minor error (user still kicked):`, axios_1.default.isAxiosError(unbanError) ? unbanError.message : unbanError);
        }
        console.log(`[TelegramService] User ${userId} kicked successfully.`);
        return true;
    }
    catch (error) {
        handleError('kickMember', error);
        return false;
    }
};
exports.kickMember = kickMember;
/**
 * 4. Setup Webhook untuk menerima update dari Telegram
 * Dipanggil saat server start
 */
const setWebhook = async () => {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!BOT_TOKEN) {
        console.warn('[TelegramService] Bot token not set. Skipping webhook setup.');
        return false;
    }
    if (!webhookUrl) {
        console.warn('[TelegramService] Webhook URL not set. Skipping webhook setup.');
        return false;
    }
    try {
        const response = await axios_1.default.post(`${BASE_URL}/setWebhook`, {
            url: webhookUrl,
            secret_token: secret,
            allowed_updates: ['chat_member', 'message'], // Fokus ke update member & messages
            drop_pending_updates: true, // Optimization: ignore old updates on restart
        });
        if (response.data.ok) {
            console.log(`[TelegramService] ✅ Webhook set to: ${webhookUrl}`);
            return true;
        }
        else {
            console.error(`[TelegramService] ❌ Webhook setup failed:`, response.data.description);
            return false;
        }
    }
    catch (error) {
        handleError('setWebhook', error);
        return false;
    }
};
exports.setWebhook = setWebhook;
/**
 * 5. Get Webhook Info (untuk debugging)
 */
const getWebhookInfo = async () => {
    if (!BOT_TOKEN)
        return null;
    try {
        const response = await axios_1.default.get(`${BASE_URL}/getWebhookInfo`);
        return response.data.result;
    }
    catch (error) {
        handleError('getWebhookInfo', error);
        return null;
    }
};
exports.getWebhookInfo = getWebhookInfo;
/**
 * 6. Delete Webhook (untuk development/testing)
 */
const deleteWebhook = async () => {
    if (!BOT_TOKEN)
        return false;
    try {
        await axios_1.default.post(`${BASE_URL}/deleteWebhook`, {
            drop_pending_updates: true,
        });
        console.log('[TelegramService] Webhook deleted.');
        return true;
    }
    catch (error) {
        handleError('deleteWebhook', error);
        return false;
    }
};
exports.deleteWebhook = deleteWebhook;
