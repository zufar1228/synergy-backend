// Shared notification dispatcher — domain-specific alert logic lives in features/
import { db } from '../db/drizzle';
import { user_notification_preferences } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import * as webPushService from './webPushService';
import * as telegramService from './telegramService';
import { shouldSendLingkunganTelegram } from '../features/lingkungan/services/lingkunganAlertingService';

/**
 * Mengirim notifikasi (push dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
export const notifySubscribers = async (
  systemType: string,
  subject: string,
  emailProps: any
) => {
  // 1. Ambil User ID yang subscribe
  const prefs = await db.query.user_notification_preferences.findMany({
    where: and(
      eq(user_notification_preferences.system_type, systemType),
      eq(user_notification_preferences.is_enabled, true)
    ),
    columns: { user_id: true }
  });
  const userIds = prefs.map((sub) => sub.user_id);

  // === TASK 1: KIRIM KE TELEGRAM GROUP (SELALU, tidak tergantung subscriber) ===
  const telegramTask = (async () => {
    try {
      const isAlert = subject.includes('PERINGATAN') || subject.includes('🚨');

      if (systemType === 'lingkungan') {
        const allowed = shouldSendLingkunganTelegram(
          emailProps.deviceId,
          isAlert
        );
        if (!allowed) {
          console.log(
            `[Alerting] Telegram lingkungan suppressed by gatekeeper for device ${emailProps.deviceId || 'unknown'}`
          );
          return;
        }
      }

      const emoji = isAlert ? '🚨' : '✅';
      const statusText = isAlert ? 'PERINGATAN BAHAYA' : 'KEMBALI NORMAL';

      let detailText = '';
      if (emailProps.details && Array.isArray(emailProps.details)) {
        detailText = emailProps.details
          .map(
            (d: { key: string; value: string }) => `   • ${d.key}: ${d.value}`
          )
          .join('\n');
      }

      const message = `
${emoji} <b>${statusText}</b> ${emoji}

📍 <b>Lokasi:</b> ${emailProps.warehouseName} - ${emailProps.areaName}
🔧 <b>Device:</b> ${emailProps.deviceName}
${emailProps.incidentType ? `⚠️ <b>Tipe:</b> ${emailProps.incidentType}` : ''}
${detailText ? `\n📊 <b>Detail:</b>\n${detailText}` : ''}

🕐 <b>Waktu:</b> ${emailProps.timestamp}

<i>Harap segera diperiksa.</i>
`.trim();

      await telegramService.sendGroupAlert(message);
      console.log('[Alerting] Telegram notification sent to group.');
    } catch (error) {
      console.error('[Alerting] Telegram notification failed:', error);
    }
  })();

  if (userIds.length === 0) {
    console.log(
      `[Alerting] No subscribers for ${systemType}, sending Telegram only.`
    );
    await telegramTask;
    return;
  }

  // === TASK 2: SIAPKAN PUSH NOTIFICATION ===
  const pushTask = (async () => {
    console.log(
      `[Alerting] Starting push task for ${userIds.length} users:`,
      userIds
    );
    const pushTitle =
      subject.includes('PERINGATAN') || subject.includes('🚨')
        ? '🚨 BAHAYA TERDETEKSI'
        : '✅ KEMBALI NORMAL';
    const pushBody = `Lokasi: ${emailProps.warehouseName} - ${
      emailProps.areaName
    }. ${emailProps.incidentType || 'Status Update'}.`;

    const pushPromises = userIds.map((userId) =>
      webPushService.sendPushNotification(userId, {
        title: pushTitle,
        body: pushBody,
        url: `/dashboard`
      })
    );
    await Promise.all(pushPromises);
    console.log('[Alerting] All push notifications processed.');
  })();

  await Promise.all([pushTask, telegramTask]);
};
