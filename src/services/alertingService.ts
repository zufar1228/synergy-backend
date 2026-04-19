/**
 * @file alertingService.ts
 * @purpose Shared notification dispatcher — routes alerts to Telegram + Web Push based on user preferences
 * @usedBy lingkunganAlertingService, intrusiAlertingService, keamanan features
 * @deps db/drizzle, user_notification_preferences, webPushService, telegramService, latencyTrackerService
 * @exports notifySubscribers
 * @sideEffects DB read (preferences), Telegram API, Web Push API
 */

// Shared notification dispatcher — domain-specific alert logic lives in features/
import { db } from '../db/drizzle';
import { user_notification_preferences } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import * as webPushService from './webPushService';
import * as telegramService from './telegramService';
import { shouldSendLingkunganTelegram } from '../features/lingkungan/services/lingkunganAlertingService';
import {
  isLatencyTrace,
  recordLatencyStage
} from '../features/intrusi/services/latencyTrackerService';

const ALERT_HINTS = ['PERINGATAN', 'ALARM', 'KRITIS', 'BAHAYA', 'DAYA BERALIH'];
const RECOVERY_HINTS = [
  'KEMBALI NORMAL',
  'DAYA PULIH',
  'PEMULIHAN',
  'TERHUBUNG KEMBALI',
  'RECOVERY'
];

const resolveAlertState = (subject: string, emailProps: any): boolean => {
  if (typeof emailProps?.isAlert === 'boolean') {
    return emailProps.isAlert;
  }

  const normalizedSubject = subject.toUpperCase();
  const normalizedIncident =
    typeof emailProps?.incidentType === 'string'
      ? emailProps.incidentType.toUpperCase()
      : '';

  if (
    RECOVERY_HINTS.some(
      (hint) =>
        normalizedSubject.includes(hint) || normalizedIncident.includes(hint)
    )
  ) {
    return false;
  }

  if (
    ALERT_HINTS.some(
      (hint) =>
        normalizedSubject.includes(hint) || normalizedIncident.includes(hint)
    )
  ) {
    return true;
  }

  return (
    subject.includes('🚨') ||
    subject.includes('⚠️') ||
    subject.includes('🪫') ||
    subject.includes('⚡')
  );
};

/**
 * Mengirim notifikasi (push dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
export const notifySubscribers = async (
  systemType: string,
  subject: string,
  emailProps: any
) => {
  const isAlert = resolveAlertState(subject, emailProps);
  const latencyTrace = emailProps?.latencyTrace;
  const hasLatencyTrace = isLatencyTrace(latencyTrace?.traceId);

  if (hasLatencyTrace) {
    await recordLatencyStage({
      traceId: latencyTrace.traceId,
      runId: latencyTrace.runId,
      scenario: latencyTrace.scenario,
      deviceId: latencyTrace.deviceId,
      eventType: latencyTrace.eventType,
      t0PublishMs: latencyTrace.publishMs,
      deviceMs: latencyTrace.deviceMs,
      t1MqttRxMs: latencyTrace.mqttRxMs,
      t4NotifyDispatchMs: Date.now()
    });
  }

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

      const sent = await telegramService.sendGroupAlert(message);
      if (hasLatencyTrace) {
        await recordLatencyStage({
          traceId: latencyTrace.traceId,
          runId: latencyTrace.runId,
          scenario: latencyTrace.scenario,
          deviceId: latencyTrace.deviceId,
          eventType: latencyTrace.eventType,
          t5TelegramApiAckMs: Date.now(),
          telegramSent: sent
        });
      }
      console.log('[Alerting] Telegram notification sent to group.');
    } catch (error) {
      if (hasLatencyTrace) {
        await recordLatencyStage({
          traceId: latencyTrace.traceId,
          runId: latencyTrace.runId,
          scenario: latencyTrace.scenario,
          deviceId: latencyTrace.deviceId,
          eventType: latencyTrace.eventType,
          telegramSent: false,
          error:
            error instanceof Error
              ? `telegram_send_failed:${error.message}`
              : 'telegram_send_failed'
        });
      }
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
    const pushTitle = isAlert ? '🚨 BAHAYA TERDETEKSI' : '✅ KEMBALI NORMAL';
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
