import webpush from 'web-push';
import { PushSubscription } from '../db/models';
import 'dotenv/config';

// Log VAPID config on startup for debugging
console.log('[WebPush] Initializing with VAPID Subject:', process.env.VAPID_SUBJECT);
console.log('[WebPush] Public Key (first 20 chars):', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.slice(0, 20) + '...');
console.log('[WebPush] Private Key exists:', !!process.env.VAPID_PRIVATE_KEY);

// Inisialisasi VAPID
try {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  console.log('[WebPush] ✅ VAPID initialized successfully');
} catch (error) {
  console.error('[WebPush] ❌ VAPID initialization failed:', error);
}

export const saveSubscription = async (userId: string, sub: { endpoint: string, keys: { p256dh: string, auth: string } }) => {
  await PushSubscription.upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  });
};

export const sendPushNotification = async (userId: string, payload: { title: string, body: string, url?: string }) => {
  console.log(`[WebPush] sendPushNotification called for user: ${userId}`);
  console.log(`[WebPush] Payload:`, JSON.stringify(payload));
  
  const subscriptions = await PushSubscription.findAll({ where: { user_id: userId } });
  
  console.log(`[WebPush] Found ${subscriptions.length} subscriptions for user ${userId}`);
  
  if (subscriptions.length === 0) {
    console.log(`[WebPush] ⚠️ No subscriptions found for user ${userId}, skipping...`);
    return;
  }

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: '/icon-192x192.png',
    url: payload.url || '/dashboard'
  });

  // Jalankan pengiriman ke semua device user ini secara paralel
  const promises = subscriptions.map(async (sub) => {
    try {
      // HAPUS HEADER 'Urgency' DULU UNTUK STABILITAS
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, notificationPayload);
      
      console.log(`[WebPush] ✅ Sent to user ${userId.slice(0,4)}...`);
    } catch (error: any) {
      // Log Error Lengkap
      console.error(`[WebPush] ❌ Failed: ${error.statusCode}`);
      if (error.body) console.error('Error Body:', error.body);

      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`[WebPush] Cleaning up expired subscription...`);
        await sub.destroy();
      }
    }
  });

  // Tunggu semua pengiriman ke user ini selesai (Parallel, tapi ditunggu)
  await Promise.all(promises);
};