"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const drizzle_1 = require("../../db/drizzle");
const schema_1 = require("../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Handle incoming webhook from Telegram
 */
const handleWebhook = async (req, res) => {
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    const expectedSecret = env_1.env.TELEGRAM_WEBHOOK_SECRET;
    // Reject requests when webhook secret is not configured (misconfiguration guard)
    if (!expectedSecret) {
        console.warn('[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET not set — rejecting request');
        return res.status(403).send('Forbidden');
    }
    // Timing-safe comparison to prevent timing attacks
    if (typeof secretToken !== 'string' ||
        secretToken.length !== expectedSecret.length ||
        !crypto_1.default.timingSafeEqual(Buffer.from(secretToken), Buffer.from(expectedSecret))) {
        console.warn('[Telegram Webhook] Invalid secret token received');
        return res.status(403).send('Forbidden');
    }
    res.status(200).send('OK');
    const update = req.body;
    const message = update.message;
    if (!message || !message.chat) {
        return;
    }
    const targetGroupId = env_1.env.TELEGRAM_GROUP_ID;
    if (targetGroupId && message.chat.id.toString() !== targetGroupId) {
        console.log(`[Telegram Webhook] Ignored update from different chat: ${message.chat.id}`);
        return;
    }
    try {
        // CASE A: New members joined
        if (message.new_chat_members && Array.isArray(message.new_chat_members)) {
            for (const member of message.new_chat_members) {
                if (member.is_bot)
                    continue;
                await drizzle_1.db
                    .insert(schema_1.telegram_subscribers)
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
                    target: schema_1.telegram_subscribers.user_id,
                    set: {
                        username: member.username || null,
                        first_name: member.first_name || null,
                        status: 'active',
                        joined_at: new Date(),
                        left_at: null,
                        kicked_at: null
                    }
                });
                console.log(`[Telegram Webhook] ✅ Member Joined: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`);
            }
        }
        // CASE B: Member left the group
        if (message.left_chat_member) {
            const member = message.left_chat_member;
            if (member.is_bot)
                return;
            const result = await drizzle_1.db
                .update(schema_1.telegram_subscribers)
                .set({
                status: 'left',
                left_at: new Date()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.telegram_subscribers.user_id, member.id))
                .returning();
            if (result.length > 0) {
                console.log(`[Telegram Webhook] 👋 Member Left: ${member.first_name} (@${member.username || 'no-username'}) [ID: ${member.id}]`);
            }
            else {
                console.log(`[Telegram Webhook] Member left but wasn't tracked: ${member.id}`);
            }
        }
        // CASE C: Regular message from a member — auto-register if not yet tracked.
        if (message.from &&
            !message.from.is_bot &&
            !message.new_chat_members &&
            !message.left_chat_member) {
            const sender = message.from;
            const existing = await drizzle_1.db.query.telegram_subscribers.findFirst({
                where: (0, drizzle_orm_1.eq)(schema_1.telegram_subscribers.user_id, sender.id)
            });
            if (!existing) {
                await drizzle_1.db.insert(schema_1.telegram_subscribers).values({
                    user_id: sender.id,
                    username: sender.username || null,
                    first_name: sender.first_name || null,
                    status: 'active',
                    joined_at: new Date(),
                    left_at: null,
                    kicked_at: null
                });
                console.log(`[Telegram Webhook] ✅ Auto-registered existing member: ${sender.first_name} (@${sender.username || 'no-username'}) [ID: ${sender.id}]`);
            }
        }
    }
    catch (error) {
        console.error('[Telegram Webhook] Error processing update:', error);
    }
};
exports.handleWebhook = handleWebhook;
