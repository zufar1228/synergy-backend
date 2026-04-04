// features/lingkungan/services/lingkunganAlertingService.ts
import { db } from '../../../db/drizzle';
import { devices } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { formatTimestampWIB } from '../../../utils/time';
import { notifySubscribers } from '../../../services/alertingService';

import { env } from '../../../config/env';

// Gatekeeper Telegram khusus lingkungan (lapis kedua anti-spam)
type LingkunganTelegramState = {
  alertActive: boolean;
  lastCriticalSentAt: number;
  lastRecoverySentAt: number;
};

const lingkunganTelegramState = new Map<string, LingkunganTelegramState>();
const TELEGRAM_CRITICAL_REMINDER_MS = env.TELEGRAM_CRITICAL_REMINDER_MS;
const TELEGRAM_RECOVERY_COOLDOWN_MS = env.TELEGRAM_RECOVERY_COOLDOWN_MS;

// Prune stale entries every 30 minutes to avoid orphaned device entries
setInterval(
  () => {
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    for (const [key, state] of lingkunganTelegramState) {
      if (
        state.lastCriticalSentAt < cutoff &&
        state.lastRecoverySentAt < cutoff &&
        !state.alertActive
      ) {
        lingkunganTelegramState.delete(key);
      }
    }
  },
  30 * 60 * 1000
);

export const shouldSendLingkunganTelegram = (
  deviceId: string | undefined,
  isAlert: boolean
): boolean => {
  if (!deviceId) return true;

  const now = Date.now();
  const state = lingkunganTelegramState.get(deviceId) ?? {
    alertActive: false,
    lastCriticalSentAt: 0,
    lastRecoverySentAt: 0
  };

  if (isAlert) {
    if (!state.alertActive) {
      state.alertActive = true;
      state.lastCriticalSentAt = now;
      lingkunganTelegramState.set(deviceId, state);
      return true;
    }

    if (now - state.lastCriticalSentAt >= TELEGRAM_CRITICAL_REMINDER_MS) {
      state.lastCriticalSentAt = now;
      lingkunganTelegramState.set(deviceId, state);
      return true;
    }

    return false;
  }

  if (!state.alertActive) {
    return false;
  }

  if (now - state.lastRecoverySentAt < TELEGRAM_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  state.alertActive = false;
  state.lastRecoverySentAt = now;
  state.lastCriticalSentAt = 0;
  lingkunganTelegramState.set(deviceId, state);
  return true;
};

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
  },
  alertType: 'PREDICTIVE' | 'FAILSAFE' | 'RECOVERY' = 'FAILSAFE'
) => {
  console.log(
    `[Alerting] 🌡️ Lingkungan predictive alert for device ${deviceId}`
  );

  const device = await db.query.devices.findFirst({
    where: eq(devices.id, deviceId),
    with: { area: { with: { warehouse: true } } }
  });

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;
  const timestamp = formatTimestampWIB();

  let incidentType = '';
  let subjectPrefix = '';

  switch (alertType) {
    case 'PREDICTIVE':
      incidentType = 'Prediksi Kondisi Lingkungan Berbahaya';
      subjectPrefix = '⚠️ [PERINGATAN PREDIKSI LINGKUNGAN]';
      break;
    case 'FAILSAFE':
      incidentType = 'KRITIS: Kondisi Lingkungan Nyata Berbahaya';
      subjectPrefix = '🚨 [PERINGATAN KRITIS LINGKUNGAN]';
      break;
    case 'RECOVERY':
      incidentType = 'PEMULIHAN SISTEM: Kondisi Lingkungan Stabil';
      subjectPrefix = '✅ [KEMBALI NORMAL LINGKUNGAN]';
      break;
    default:
      incidentType = 'Kondisi Lingkungan Berbahaya Terdeteksi';
      subjectPrefix = '🌡️ [PERINGATAN LINGKUNGAN]';
  }

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
  const subject = `${subjectPrefix} ${incidentType} di ${warehouse.name} - ${area.name}`;

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
