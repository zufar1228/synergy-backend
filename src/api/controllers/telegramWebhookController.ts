// backend/src/api/controllers/telegramWebhookController.ts
import { Request, Response } from 'express';
import { TelegramSubscriber } from '../../db/models';
import 'dotenv/config';

// Types for Telegram webhook updates
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  new_chat_members?: TelegramUser[];
  left_chat_member?: TelegramUser;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  chat_member?: any; // For advanced chat_member updates
}

/**
 * Handle incoming webhook from Telegram
 * This endpoint is called by Telegram whenever there's an update in the group
 */
export const handleWebhook = async (req: Request, res: Response) => {
  // 1. Security: Validate Secret Token
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  
  if (expectedSecret && secretToken !== expectedSecret) {
    console.warn('[Telegram Webhook] Invalid secret token received');
    return res.status(403).send('Forbidden');
  }

  // Respond quickly to Telegram to prevent timeout & retries
  res.status(200).send('OK');

  const update: TelegramUpdate = req.body;
  const message = update.message;

  // Early exit if no message
  if (!message || !message.chat) {
    return;
  }

  // 2. Chat Scoping: Ensure event is from target group
  const targetGroupId = process.env.TELEGRAM_GROUP_ID;
  if (targetGroupId && message.chat.id.toString() !== targetGroupId) {
    console.log(`[Telegram Webhook] Ignored update from different chat: ${message.chat.id}`);
    return;
  }

  try {
    // CASE A: New members joined
    if (message.new_chat_members && Array.isArray(message.new_chat_members)) {
      for (const member of message.new_chat_members) {
        // Skip bots
        if (member.is_bot) continue;

        // Upsert: Insert or Update if exists
        await TelegramSubscriber.upsert({
          user_id: member.id,
          username: member.username || null,
          first_name: member.first_name || null,
          status: 'active',
          joined_at: new Date(),
          left_at: null,
          kicked_at: null,
        });
        
        console.log(`[Telegram Webhook] ✅ Member Joined: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`);
      }
    }

    // CASE B: Member left the group
    if (message.left_chat_member) {
      const member = message.left_chat_member;
      
      // Skip bots
      if (member.is_bot) return;

      // Update status to 'left'
      const [affectedRows] = await TelegramSubscriber.update(
        { 
          status: 'left', 
          left_at: new Date(),
          // Don't set kicked_at here - this is voluntary leave
        },
        { where: { user_id: member.id } }
      );

      if (affectedRows > 0) {
        console.log(`[Telegram Webhook] 👋 Member Left: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`);
      } else {
        console.log(`[Telegram Webhook] Member left but wasn't tracked: ${member.id}`);
      }
    }

  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
    // Don't throw - we already sent 200 OK to Telegram
  }
};
