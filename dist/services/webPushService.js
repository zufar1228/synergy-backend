"use strict";
/**
 * @file webPushService.ts
 * @purpose Web Push notification sender + subscription persistence
 * @usedBy userController, alertingService
 * @deps web-push, db/drizzle, schema (push_subscriptions), env
 * @exports saveSubscription, sendPushNotification
 * @sideEffects DB read/write (push_subscriptions), Web Push API calls
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = exports.saveSubscription = void 0;
const web_push_1 = __importDefault(require("web-push"));
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const env_1 = require("../config/env");
// Log VAPID config on startup for debugging
console.log('[WebPush] Initializing with VAPID Subject:', env_1.env.VAPID_SUBJECT);
console.log('[WebPush] Public Key (first 20 chars):', env_1.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.slice(0, 20) + '...');
console.log('[WebPush] Private Key exists:', !!env_1.env.VAPID_PRIVATE_KEY);
try {
    if (env_1.env.VAPID_SUBJECT &&
        env_1.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        env_1.env.VAPID_PRIVATE_KEY) {
        web_push_1.default.setVapidDetails(env_1.env.VAPID_SUBJECT, env_1.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env_1.env.VAPID_PRIVATE_KEY);
        console.log('[WebPush] VAPID initialized successfully');
    }
    else {
        console.warn('[WebPush] VAPID keys not fully configured, push notifications disabled');
    }
}
catch (error) {
    console.error('[WebPush] VAPID initialization failed:', error);
}
const saveSubscription = async (userId, sub) => {
    await drizzle_1.db
        .insert(schema_1.push_subscriptions)
        .values({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth
    })
        .onConflictDoUpdate({
        target: schema_1.push_subscriptions.endpoint,
        set: {
            user_id: userId,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            updated_at: new Date()
        }
    });
};
exports.saveSubscription = saveSubscription;
const sendPushNotification = async (userId, payload) => {
    console.log(`[WebPush] sendPushNotification called for user: ${userId}`);
    console.log(`[WebPush] Payload:`, JSON.stringify(payload));
    const subscriptions = await drizzle_1.db.query.push_subscriptions.findMany({
        where: (0, drizzle_orm_1.eq)(schema_1.push_subscriptions.user_id, userId)
    });
    console.log(`[WebPush] Found ${subscriptions.length} subscriptions for user ${userId}`);
    if (subscriptions.length === 0) {
        console.log(`[WebPush] No subscriptions found for user ${userId}, skipping...`);
        return;
    }
    const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: '/icon-192x192.png',
        url: payload.url || '/dashboard'
    });
    const promises = subscriptions.map(async (sub) => {
        try {
            await web_push_1.default.sendNotification({
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth }
            }, notificationPayload, { urgency: 'high', TTL: 60 });
            console.log(`[WebPush] Sent to user ${userId.slice(0, 4)}...`);
        }
        catch (error) {
            console.error(`[WebPush] Failed: ${error.statusCode}`);
            if (error.body)
                console.error('Error Body:', error.body);
            // Clean up subscriptions that are no longer valid
            if (error.statusCode === 410 ||
                error.statusCode === 404 ||
                error.statusCode === 401) {
                console.log(`[WebPush] Cleaning up invalid subscription (HTTP ${error.statusCode})...`);
                await drizzle_1.db
                    .delete(schema_1.push_subscriptions)
                    .where((0, drizzle_orm_1.eq)(schema_1.push_subscriptions.id, sub.id));
            }
        }
    });
    await Promise.all(promises);
};
exports.sendPushNotification = sendPushNotification;
