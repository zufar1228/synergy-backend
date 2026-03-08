// backend/src/services/alertingService.ts
import {
  Device,
  Area,
  Warehouse,
  UserNotificationPreference
} from '../db/models';
import * as webPushService from './webPushService';
import * as telegramService from './telegramService';

// Definisikan tipe untuk hasil query eager-loading
interface DeviceWithRelations extends Device {
  area: Area & {
    warehouse: Warehouse;
  };
}

const formatTimestampWIB = (date: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('day')} ${pick('month')} ${pick('year')}, ${pick(
    'hour'
  )}:${pick('minute')}:${pick('second')} WIB`;
};

/**
 * Mengirim notifikasi (push dan Telegram) ke semua pengguna yang berlangganan
 * CATATAN: Telegram dikirim ke GROUP terlepas dari ada tidaknya subscriber
 */
const notifySubscribers = async (
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

/**
 * Process alarm events from the door security (intrusi) system.
 * Called for FORCED_ENTRY_ALARM and UNAUTHORIZED_OPEN events.
 */
export const processIntrusiAlert = async (
  deviceId: string,
  data: {
    type: string;
    state?: string;
    door?: string;
    peak_delta_g?: number;
    hit_count?: number;
    [key: string]: any;
  }
) => {
  console.log(
    `[Alerting] 🚨 Intrusi alarm: ${data.type} for device ${deviceId}`
  );

  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: 'area',
        include: [{ model: Warehouse, as: 'warehouse' }]
      }
    ]
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;

  const timestamp = formatTimestampWIB();

  const isUnauthorizedOpen = data.type === 'UNAUTHORIZED_OPEN';
  const incidentType = isUnauthorizedOpen
    ? 'Pembukaan Pintu Tidak Sah'
    : 'Percobaan Pembobolan (Forced Entry)';

  const details: { key: string; value: string }[] = [
    { key: 'Tipe Event', value: data.type },
    { key: 'Status Pintu', value: data.door || 'N/A' },
    { key: 'Mode Sistem', value: data.state || 'N/A' }
  ];

  if (!isUnauthorizedOpen && data.peak_delta_g != null) {
    details.push({
      key: 'Peak Impact (g)',
      value: data.peak_delta_g.toFixed(3)
    });
    // v19: show threat_score (leaky bucket) instead of hit_count
    if (data.threat_score != null) {
      details.push({
        key: 'Threat Score',
        value: Number(data.threat_score).toFixed(2)
      });
    } else if (data.hit_count != null) {
      details.push({ key: 'Hit Count', value: String(data.hit_count) });
    }
  }

  const emailProps = {
    incidentType,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details
  };
  const subject = `🚨 [ALARM INTRUSI] ${incidentType} di ${warehouse.name} - ${area.name}`;

  try {
    await notifySubscribers('intrusi', subject, emailProps);
    console.log('[Alerting] Intrusi alert notifications sent.');
  } catch (err) {
    console.error('[Alerting] Error sending intrusi alert notifications:', err);
  }
};

// ============================================================================
// LINGKUNGAN (Environmental Monitoring) ALERTS
// ============================================================================

/**
 * Process predictive alerts from the environmental monitoring (lingkungan) system.
 * Called when ML predictions exceed safety thresholds.
 */
export const processLingkunganAlert = async (
  deviceId: string,
  alerts: string[],
  data: {
    temperature: number;
    humidity: number;
    co2: number;
  }
) => {
  console.log(
    `[Alerting] 🌡️ Lingkungan predictive alert for device ${deviceId}`
  );

  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: 'area',
        include: [{ model: Warehouse, as: 'warehouse' }]
      }
    ]
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;

  const timestamp = formatTimestampWIB();

  const incidentType = 'Kondisi Lingkungan Berbahaya Terdeteksi';

  const details: { key: string; value: string }[] = [
    {
      key: 'Suhu Saat Ini',
      value: `${data.temperature.toFixed(1)}°C`
    },
    {
      key: 'Kelembapan Saat Ini',
      value: `${data.humidity.toFixed(1)}%`
    },
    {
      key: 'CO2 Saat Ini',
      value: `${data.co2.toFixed(0)} ppm`
    }
  ];

  alerts.forEach((alert) => {
    details.push({ key: 'Peringatan', value: alert });
  });

  const emailProps = {
    incidentType,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details
  };
  const subject = `🌡️ [PERINGATAN LINGKUNGAN] ${incidentType} di ${warehouse.name} - ${area.name}`;

  try {
    await notifySubscribers('lingkungan', subject, emailProps);
    console.log('[Alerting] Lingkungan alert notifications sent.');
  } catch (err) {
    console.error(
      '[Alerting] Error sending lingkungan alert notifications:',
      err
    );
  }
};

// ============================================================================
// POWER & BATTERY ALERTS
// ============================================================================
// In-memory cache to prevent duplicate power alerts
const devicePowerState: Map<
  string,
  {
    lastPowerSource?: string;
    lastBatteryCriticalSentAt?: Date;
  }
> = new Map();

const BATTERY_CRITICAL_PCT = 10;
const BATTERY_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between critical alerts

/**
 * Process power/battery status and send alerts when:
 * - Power source changes (MAINS ↔ BATTERY)
 * - Battery percentage drops to critical level
 */
export const processPowerAlert = async (
  deviceId: string,
  data: {
    power_source?: string;
    vbat_v?: number;
    vbat_pct?: number;
  }
) => {
  const state = devicePowerState.get(deviceId) || {};
  let shouldAlert = false;
  let alertType: 'power_change' | 'battery_critical' = 'power_change';

  // Check power source change
  if (
    data.power_source &&
    state.lastPowerSource &&
    data.power_source !== state.lastPowerSource
  ) {
    shouldAlert = true;
    alertType = 'power_change';
    console.log(
      `[Alerting] ⚡ Power source changed for ${deviceId}: ${state.lastPowerSource} → ${data.power_source}`
    );
  }

  // Always update tracked power source
  if (data.power_source) {
    state.lastPowerSource = data.power_source;
  }

  // Check battery critical (only when on BATTERY)
  if (
    data.vbat_pct !== undefined &&
    data.vbat_pct <= BATTERY_CRITICAL_PCT &&
    data.power_source === 'BATTERY'
  ) {
    const now = new Date();
    const lastSent = state.lastBatteryCriticalSentAt;
    if (
      !lastSent ||
      now.getTime() - lastSent.getTime() > BATTERY_ALERT_COOLDOWN_MS
    ) {
      shouldAlert = true;
      alertType = 'battery_critical';
      state.lastBatteryCriticalSentAt = now;
      console.log(
        `[Alerting] 🪫 Battery critical for ${deviceId}: ${data.vbat_pct}%`
      );
    }
  }

  devicePowerState.set(deviceId, state);

  if (!shouldAlert) return;

  // Fetch device relations for notification context
  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: 'area',
        include: [{ model: Warehouse, as: 'warehouse' }]
      }
    ]
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;
  const timestamp = formatTimestampWIB();

  let incidentType: string;
  let subject: string;
  const details: { key: string; value: string }[] = [];

  if (alertType === 'battery_critical') {
    incidentType = 'Baterai Kritis';
    subject = `🪫 [BATERAI KRITIS] ${device.name} di ${warehouse.name} - ${area.name}`;
    details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
    if (data.vbat_v !== undefined) {
      details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
    }
    details.push({ key: 'Sumber Daya', value: 'BATERAI (Adaptor Terputus)' });
  } else {
    const isSwitchToBattery = data.power_source === 'BATTERY';
    incidentType = isSwitchToBattery
      ? 'Sumber Daya Beralih ke Baterai'
      : 'Sumber Daya Adaptor Terhubung Kembali';
    subject = isSwitchToBattery
      ? `⚡ [DAYA BERALIH] ${device.name} beralih ke Baterai — ${warehouse.name}`
      : `✅ [DAYA PULIH] ${device.name} kembali ke Adaptor — ${warehouse.name}`;
    details.push({
      key: 'Sumber Daya',
      value: isSwitchToBattery ? 'BATERAI' : 'ADAPTOR (PLN)'
    });
    if (data.vbat_pct !== undefined) {
      details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
    }
    if (data.vbat_v !== undefined) {
      details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
    }
  }

  const emailProps = {
    incidentType,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details
  };

  try {
    await notifySubscribers('intrusi', subject, emailProps);
    console.log(`[Alerting] Power/battery alert sent for ${deviceId}.`);
  } catch (err) {
    console.error('[Alerting] Error sending power alert:', err);
  }
};
