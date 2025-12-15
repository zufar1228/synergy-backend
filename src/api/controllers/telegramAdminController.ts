// backend/src/api/controllers/telegramAdminController.ts
import { Request, Response } from 'express';
import * as telegramService from '../../services/telegramService';
import { TelegramSubscriber } from '../../db/models';
import ApiError from '../../utils/apiError';

/**
 * Handle errors consistently
 */
const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
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
export const createInvite = async (req: Request, res: Response) => {
  try {
    const result = await telegramService.createSingleUseInviteLink();
    
    res.json({
      success: true,
      invite_link: result.invite_link,
      expires_at: new Date(Date.now() + 600 * 1000).toISOString(), // 10 minutes
      member_limit: 1,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 2. Kick member from Telegram group
 * POST /api/telegram/kick
 * Body: { user_id: number }
 */
export const kickSubscriber = async (req: Request, res: Response) => {
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
      await TelegramSubscriber.update(
        { 
          status: 'kicked', 
          kicked_at: new Date() 
        },
        { where: { user_id: telegramUserId } }
      );
      
      res.json({ 
        success: true, 
        message: 'User berhasil di-kick dari grup Telegram' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Gagal mengeluarkan user via Telegram API' 
      });
    }
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 3. List all Telegram subscribers
 * GET /api/telegram/members?include_inactive=true
 */
export const getSubscribers = async (req: Request, res: Response) => {
  try {
    const { include_inactive, status } = req.query;
    
    // Build where clause
    let whereClause: any = {};
    
    if (status && typeof status === 'string') {
      // Filter by specific status
      whereClause.status = status;
    } else if (include_inactive !== 'true') {
      // Default: only active members
      whereClause.status = 'active';
    }
    // If include_inactive=true, show all (no filter)
    
    const subscribers = await TelegramSubscriber.findAll({
      where: whereClause,
      order: [['joined_at', 'DESC']],
      attributes: ['user_id', 'username', 'first_name', 'status', 'joined_at', 'left_at', 'kicked_at'],
    });
    
    res.json({ 
      success: true,
      count: subscribers.length,
      data: subscribers 
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 4. Get webhook info (for debugging)
 * GET /api/telegram/webhook-info
 */
export const getWebhookInfo = async (req: Request, res: Response) => {
  try {
    const info = await telegramService.getWebhookInfo();
    
    if (info) {
      res.json({
        success: true,
        data: info
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Gagal mengambil info webhook'
      });
    }
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 5. Manually trigger webhook setup
 * POST /api/telegram/setup-webhook
 */
export const setupWebhook = async (req: Request, res: Response) => {
  try {
    const success = await telegramService.setWebhook();
    
    if (success) {
      res.json({
        success: true,
        message: 'Webhook berhasil di-setup'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Gagal setup webhook. Periksa konfigurasi environment.'
      });
    }
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * 6. Send test alert to Telegram group
 * POST /api/telegram/test-alert
 */
export const sendTestAlert = async (req: Request, res: Response) => {
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
    } else {
      res.status(500).json({
        success: false,
        message: 'Gagal mengirim pesan tes. Periksa konfigurasi bot.'
      });
    }
  } catch (error) {
    handleError(res, error);
  }
};
