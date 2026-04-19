/**
 * @file telegramWebhookController.ts
 * @purpose Handles incoming Telegram webhook updates (member join/leave, commands)
 * @usedBy telegramRoutes.ts (public endpoint, no auth)
 * @deps env, db/drizzle, telegram_subscribers schema
 * @exports handleWebhook
 * @sideEffects DB write (telegram_subscribers), Telegram API signature verification
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { db } from '../../db/drizzle';
import { telegram_subscribers } from '../../db/schema';
import { eq } from 'drizzle-orm';

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
  chat_member?: any;
}

/**
 * Handle incoming webhook from Telegram
 */
export const handleWebhook = async (req: Request, res: Response) => {
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;

  // Reject requests when webhook secret is not configured (misconfiguration guard)
  if (!expectedSecret) {
    console.warn(
      '[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET not set — rejecting request'
    );
    return res.status(403).send('Forbidden');
  }

  // Timing-safe comparison to prevent timing attacks
  if (
    typeof secretToken !== 'string' ||
    secretToken.length !== expectedSecret.length ||
    !crypto.timingSafeEqual(
      Buffer.from(secretToken),
      Buffer.from(expectedSecret)
    )
  ) {
    console.warn('[Telegram Webhook] Invalid secret token received');
    return res.status(403).send('Forbidden');
  }

  res.status(200).send('OK');

  const update: TelegramUpdate = req.body;
  const message = update.message;

  if (!message || !message.chat) {
    return;
  }

  const targetGroupId = env.TELEGRAM_GROUP_ID;
  if (targetGroupId && message.chat.id.toString() !== targetGroupId) {
    console.log(
      `[Telegram Webhook] Ignored update from different chat: ${message.chat.id}`
    );
    return;
  }

  try {
    // CASE A: New members joined
    if (message.new_chat_members && Array.isArray(message.new_chat_members)) {
      for (const member of message.new_chat_members) {
        if (member.is_bot) continue;

        await db
          .insert(telegram_subscribers)
          .values({
            user_id: member.id,
            username: member.username || null,
            first_name: member.first_name || null,
            status: 'active',
            joined_at: new Date(),
            left_at: null,
            kicked_at: null
          })
          .onConflictDoUpdate({
            target: telegram_subscribers.user_id,
            set: {
              username: member.username || null,
              first_name: member.first_name || null,
              status: 'active',
              joined_at: new Date(),
              left_at: null,
              kicked_at: null
            }
          });

        console.log(
          `[Telegram Webhook] ✅ Member Joined: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`
        );
      }
    }

    // CASE B: Member left the group
    if (message.left_chat_member) {
      const member = message.left_chat_member;
      if (member.is_bot) return;

      const result = await db
        .update(telegram_subscribers)
        .set({
          status: 'left',
          left_at: new Date()
        })
        .where(eq(telegram_subscribers.user_id, member.id))
        .returning();

      if (result.length > 0) {
        console.log(
          `[Telegram Webhook] 👋 Member Left: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`
        );
      } else {
        console.log(
          `[Telegram Webhook] Member left but wasn't tracked: ${member.id}`
        );
      }
    }

    // CASE C: Regular message from a member — auto-register if not yet tracked.
    if (
      message.from &&
      !message.from.is_bot &&
      !message.new_chat_members &&
      !message.left_chat_member
    ) {
      const sender = message.from;
      const existing = await db.query.telegram_subscribers.findFirst({
        where: eq(telegram_subscribers.user_id, sender.id)
      });

      if (!existing) {
        await db.insert(telegram_subscribers).values({
          user_id: sender.id,
          username: sender.username || null,
          first_name: sender.first_name || null,
          status: 'active',
          joined_at: new Date(),
          left_at: null,
          kicked_at: null
        });
        console.log(
          `[Telegram Webhook] ✅ Auto-registered existing member: ${sender.first_name} (@${sender.username || 'no-username'}) [ID: ${sender.id}]`
        );
      }
    }
  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
  }
};
