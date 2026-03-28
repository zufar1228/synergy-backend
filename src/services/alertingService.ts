// backend/src/services/alertingService.ts
// Shared notification dispatcher — domain-specific alert logic lives in features/
import { UserNotificationPreference } from '../db/models';
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
  const userIds = (
    await UserNotificationPreference.findAll({
      where: { system_type: systemType, is_enabled: true },
      attributes: ['user_id']
    })
  ).map((sub) => sub.user_id);

  // === TASK 1: KIRIM KE TELEGRAM GROUP (SELALU, tidak tergantung subscriber) ===
  const telegramTask = (async () => {
    try {
      // Check if this is an alert (not "back to normal" message)
      // Alert subjects contain: PERINGATAN, 🚨
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

      // Build detail text from emailProps.details if available
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

  // Jika tidak ada subscriber, hanya kirim Telegram saja
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

    // Map menjadi array of promises
    const pushPromises = userIds.map((userId) =>
      webPushService.sendPushNotification(userId, {
        title: pushTitle,
        body: pushBody,
        url: `/dashboard`
      })
    );
    // Jalankan paralel
    await Promise.all(pushPromises);
    console.log('[Alerting] All push notifications processed.');
  })();

  // === EKSEKUSI SEMUANYA BERSAMAAN ===
  // Push dan Telegram jalan paralel
  await Promise.all([pushTask, telegramTask]);
};
