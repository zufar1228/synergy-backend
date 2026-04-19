/**
 * @file webPushService.ts
 * @purpose Web Push notification sender + subscription persistence
 * @usedBy userController, alertingService
 * @deps web-push, db/drizzle, schema (push_subscriptions), env
 * @exports saveSubscription, sendPushNotification
 * @sideEffects DB read/write (push_subscriptions), Web Push API calls
 */

import webpush from 'web-push';
import { db } from '../db/drizzle';
import { push_subscriptions } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';

// Log VAPID config on startup for debugging
console.log('[WebPush] Initializing with VAPID Subject:', env.VAPID_SUBJECT);
console.log(
  '[WebPush] Public Key (first 20 chars):',
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.slice(0, 20) + '...'
);
console.log('[WebPush] Private Key exists:', !!env.VAPID_PRIVATE_KEY);

try {
  if (
    env.VAPID_SUBJECT &&
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY
  ) {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );
    console.log('[WebPush] ✅ VAPID initialized successfully');
  } else {
    console.warn(
      '[WebPush] ⚠️ VAPID keys not fully configured, push notifications disabled'
    );
  }
} catch (error) {
  console.error('[WebPush] ❌ VAPID initialization failed:', error);
}

export const saveSubscription = async (
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
) => {
  await db
    .insert(push_subscriptions)
    .values({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth
    })
    .onConflictDoUpdate({
      target: push_subscriptions.endpoint,
      set: {
        user_id: userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        updated_at: new Date()
      }
    });
};

export const sendPushNotification = async (
  userId: string,
  payload: { title: string; body: string; url?: string }
) => {
  console.log(`[WebPush] sendPushNotification called for user: ${userId}`);
  console.log(`[WebPush] Payload:`, JSON.stringify(payload));

  const subscriptions = await db.query.push_subscriptions.findMany({
    where: eq(push_subscriptions.user_id, userId)
  });

  console.log(
    `[WebPush] Found ${subscriptions.length} subscriptions for user ${userId}`
  );

  if (subscriptions.length === 0) {
    console.log(
      `[WebPush] ⚠️ No subscriptions found for user ${userId}, skipping...`
    );
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
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        notificationPayload,
        { urgency: 'high', TTL: 60 }
      );
      console.log(`[WebPush] ✅ Sent to user ${userId.slice(0, 4)}...`);
    } catch (error: any) {
      console.error(`[WebPush] ❌ Failed: ${error.statusCode}`);
      if (error.body) console.error('Error Body:', error.body);

      // Clean up subscriptions that are no longer valid
      if (
        error.statusCode === 410 ||
        error.statusCode === 404 ||
        error.statusCode === 401
      ) {
        console.log(
          `[WebPush] Cleaning up invalid subscription (HTTP ${error.statusCode})...`
        );
        await db
          .delete(push_subscriptions)
          .where(eq(push_subscriptions.id, sub.id));
      }
    }
  });

  await Promise.all(promises);
};
