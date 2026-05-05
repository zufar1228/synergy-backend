/**
 * @file lingkunganAlertingService.ts
 * @purpose Domain-specific alert logic for lingkungan — anti-spam gatekeeper + alert formatting
 * @usedBy mqtt/client (on lingkungan message), alertingService
 * @deps db/drizzle, schema (devices), alertingService, time util, env
 * @exports shouldSendLingkunganTelegram, processLingkunganAlert
 * @sideEffects DB read, Telegram + Web Push via alertingService
 */

import { db } from '../../../db/drizzle';
import { devices } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { formatTimestampWIB } from '../../../utils/time';
import { notifySubscribers } from '../../../services/alertingService';

// No anti-spam — all lingkungan alerts are forwarded to Telegram immediately.

export const shouldSendLingkunganTelegram = (
  _deviceId: string | undefined,
  _isAlert: boolean
): boolean => {
  // Anti-spam dihapus — semua notifikasi selalu diteruskan.
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
    `[Alerting] Lingkungan predictive alert for device ${deviceId}`
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
      subjectPrefix = '[PERINGATAN PREDIKSI LINGKUNGAN]';
      break;
    case 'FAILSAFE':
      incidentType = 'KRITIS: Kondisi Lingkungan Nyata Berbahaya';
      subjectPrefix = '[PERINGATAN KRITIS LINGKUNGAN]';
      break;
    case 'RECOVERY':
      incidentType = 'PEMULIHAN SISTEM: Kondisi Lingkungan Stabil';
      subjectPrefix = '[KEMBALI NORMAL LINGKUNGAN]';
      break;
    default:
      incidentType = 'Kondisi Lingkungan Berbahaya Terdeteksi';
      subjectPrefix = '[PERINGATAN LINGKUNGAN]';
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
