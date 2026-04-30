/**
 * @file telegramAdminController.ts
 * @purpose HTTP handlers for Telegram bot admin operations (invite, kick, webhook)
 * @usedBy telegramRoutes.ts
 * @deps telegramService, db/drizzle, ApiError, time util
 * @exports createInvite, kickSubscriber, getSubscribers, getWebhookInfo, setupWebhook, sendTestAlert
 * @sideEffects DB read/write (telegram_subscribers), Telegram API calls
 */

import { Request, Response } from 'express';
import * as telegramService from '../../services/telegramService';
import { db } from '../../db/drizzle';
import { telegram_subscribers } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import ApiError from '../../utils/apiError';
import { formatTimestampWIB } from '../../utils/time';

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

export const createInvite = async (req: Request, res: Response) => {
  try {
    const result = await telegramService.createSingleUseInviteLink();
    
    res.json({
      success: true,
      invite_link: result.invite_link,
      expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
      member_limit: 1,
    });
  } catch (error) {
    handleError(res, error);
  }
};

export const kickSubscriber = async (req: Request, res: Response) => {
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
      await db
        .update(telegram_subscribers)
        .set({ status: 'kicked', kicked_at: new Date() })
        .where(eq(telegram_subscribers.user_id, telegramUserId));
      
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

export const getSubscribers = async (req: Request, res: Response) => {
  try {
    const { include_inactive, status } = req.query;
    
    let whereClause;
    
    if (status && typeof status === 'string') {
      whereClause = eq(telegram_subscribers.status, status as any);
    } else if (include_inactive !== 'true') {
      whereClause = eq(telegram_subscribers.status, 'active');
    }
    
    const subscribers = await db.query.telegram_subscribers.findMany({
      where: whereClause,
      orderBy: [desc(telegram_subscribers.joined_at)],
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
  } catch (error) {
    handleError(res, error);
  }
};

export const getWebhookInfo = async (req: Request, res: Response) => {
  try {
    const info = await telegramService.getWebhookInfo();
    
    if (info) {
      res.json({ success: true, data: info });
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

export const setupWebhook = async (req: Request, res: Response) => {
  try {
    const success = await telegramService.setWebhook();
    
    if (success) {
      res.json({ success: true, message: 'Webhook berhasil di-setup' });
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

export const sendTestAlert = async (req: Request, res: Response) => {
  try {
    const timestamp = formatTimestampWIB();

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
