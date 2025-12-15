// backend/src/services/telegramService.ts
import axios, { AxiosError } from 'axios';
import 'dotenv/config';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const BASE_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Type definitions for Telegram API responses
interface TelegramInviteLink {
  invite_link: string;
  creator: { id: number; first_name: string };
  creates_join_request: boolean;
  is_primary: boolean;
  is_revoked: boolean;
  expire_date?: number;
  member_limit?: number;
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

/**
 * Helper untuk handle error axios dengan logging yang konsisten
 */
const handleError = (context: string, error: unknown): null => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ description?: string }>;
    console.error(
      `[TelegramService] ${context} Failed:`,
      axiosError.response?.data?.description || axiosError.message
    );
  } else if (error instanceof Error) {
    console.error(`[TelegramService] ${context} Error:`, error.message);
  } else {
    console.error(`[TelegramService] ${context} Unknown Error:`, error);
  }
  // Return null agar tidak mematikan flow utama
  return null;
};

/**
 * Validasi konfigurasi Telegram
 */
const validateConfig = (): boolean => {
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
export const sendGroupAlert = async (message: string): Promise<boolean> => {
  if (!validateConfig()) return false;

  try {
    await axios.post<TelegramResponse<any>>(`${BASE_URL}/sendMessage`, {
      chat_id: GROUP_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true, // Optimization: disable link previews for alerts
    });
    console.log('[TelegramService] Alert sent successfully.');
    return true;
  } catch (error) {
    handleError('sendGroupAlert', error);
    return false;
  }
};

/**
 * 2. Buat Invite Link Sekali Pakai (Expire 10 menit)
 * Berguna untuk mengundang user baru ke grup monitoring
 */
export const createSingleUseInviteLink = async (): Promise<TelegramInviteLink> => {
  if (!validateConfig()) {
    throw new Error('Telegram not configured');
  }

  try {
    const expireDate = Math.floor(Date.now() / 1000) + 600; // 10 menit dari sekarang
    const response = await axios.post<TelegramResponse<TelegramInviteLink>>(
      `${BASE_URL}/createChatInviteLink`,
      {
        chat_id: GROUP_ID,
        member_limit: 1,
        expire_date: expireDate,
        name: `Invite ${new Date().toISOString()}`, // Label untuk tracking
      }
    );
    
    console.log('[TelegramService] Invite link created:', response.data.result.invite_link);
    return response.data.result;
  } catch (error) {
    handleError('createInviteLink', error);
    throw new Error('Gagal membuat link undangan Telegram');
  }
};

/**
 * 3. Kick Member dari Grup (Ban lalu Unban agar bisa join lagi nanti)
 * Menggunakan Promise-based unban dengan retry logic
 */
export const kickMember = async (userId: number | string): Promise<boolean> => {
  if (!validateConfig()) return false;

  try {
    // Ban (Kick) member
    await axios.post(`${BASE_URL}/banChatMember`, {
      chat_id: GROUP_ID,
      user_id: userId,
    });
    
    console.log(`[TelegramService] User ${userId} banned from group.`);

    // Unban setelah delay singkat (agar user bisa diinvite lagi di masa depan)
    // Menggunakan Promise-based approach yang lebih clean
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    try {
      await axios.post(`${BASE_URL}/unbanChatMember`, {
        chat_id: GROUP_ID,
        user_id: userId,
        only_if_banned: true,
      });
      console.log(`[TelegramService] User ${userId} unbanned (can be re-invited).`);
    } catch (unbanError) {
      // Unban failure is not critical - user is still kicked
      console.warn(`[TelegramService] Unban minor error (user still kicked):`, 
        axios.isAxiosError(unbanError) ? unbanError.message : unbanError);
    }

    console.log(`[TelegramService] User ${userId} kicked successfully.`);
    return true;
  } catch (error) {
    handleError('kickMember', error);
    return false;
  }
};

/**
 * 4. Setup Webhook untuk menerima update dari Telegram
 * Dipanggil saat server start
 */
export const setWebhook = async (): Promise<boolean> => {
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
    const response = await axios.post<TelegramResponse<boolean>>(`${BASE_URL}/setWebhook`, {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['chat_member', 'message'], // Fokus ke update member & messages
      drop_pending_updates: true, // Optimization: ignore old updates on restart
    });

    if (response.data.ok) {
      console.log(`[TelegramService] ✅ Webhook set to: ${webhookUrl}`);
      return true;
    } else {
      console.error(`[TelegramService] ❌ Webhook setup failed:`, response.data.description);
      return false;
    }
  } catch (error) {
    handleError('setWebhook', error);
    return false;
  }
};

/**
 * 5. Get Webhook Info (untuk debugging)
 */
export const getWebhookInfo = async (): Promise<any> => {
  if (!BOT_TOKEN) return null;

  try {
    const response = await axios.get(`${BASE_URL}/getWebhookInfo`);
    return response.data.result;
  } catch (error) {
    handleError('getWebhookInfo', error);
    return null;
  }
};

/**
 * 6. Delete Webhook (untuk development/testing)
 */
export const deleteWebhook = async (): Promise<boolean> => {
  if (!BOT_TOKEN) return false;

  try {
    await axios.post(`${BASE_URL}/deleteWebhook`, {
      drop_pending_updates: true,
    });
    console.log('[TelegramService] Webhook deleted.');
    return true;
  } catch (error) {
    handleError('deleteWebhook', error);
    return false;
  }
};
