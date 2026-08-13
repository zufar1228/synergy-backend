/**
 * @file repeatDetectionService.ts
 * @purpose Detects repeated unresolved keamanan events within time window and sends Telegram alerts
 * @usedBy keamananController, repeatDetectionJob
 * @deps db/drizzle, schema (keamanan_logs, devices), telegramService, time util
 * @exports findAndNotifyRepeatDetections
 * @sideEffects DB read (keamanan_logs), Telegram API call
 */

import { db } from '../../../db/drizzle';
import { keamanan_logs, devices } from '../../../db/schema';
import { eq, and, gt, inArray } from 'drizzle-orm';
import * as telegramService from '../../../services/telegramService';
import { formatTimestampWIB } from '../../../utils/time';

const REPEAT_WINDOW_MINUTES = 15;

// In-memory set to prevent spamming notifications for the same device
// since the notification_sent_at column was removed from the database
const recentlyNotifiedDevices = new Set<string>();

/**
 * Layanan utama untuk mencari dan memberi notifikasi deteksi berulang
 */
export const findAndNotifyRepeatDetections = async () => {
  // 1. Cari semua log deteksi baru yang belum diproses notifikasinya
  const windowStart = new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60 * 1000);
  const newDetections = await db.query.keamanan_logs.findMany({
    where: and(
      eq(keamanan_logs.status, 'unacknowledged'),
      gt(keamanan_logs.created_at, windowStart)
    ),
    with: {
      device: {
        with: {
          area: {
            with: { warehouse: true }
          }
        }
      }
    },
    orderBy: (keamanan_logs, { asc }) => [asc(keamanan_logs.created_at)]
  });

  if (newDetections.length === 0) {
    console.log('[RepeatDetection] Tidak ada deteksi baru untuk diproses.');
    return;
  }

  // Gunakan Map untuk mengelompokkan log berdasarkan device_id
  const detectionMap = new Map<string, typeof newDetections>();

  for (const detection of newDetections) {
    const identityKey = `${detection.device_id}`;
    if (!detectionMap.has(identityKey)) {
      detectionMap.set(identityKey, []);
    }
    detectionMap.get(identityKey)!.push(detection);
  }

  // 2. Proses setiap grup identitas
  for (const [identityKey, detections] of detectionMap.entries()) {
    // 3. Cek apakah device ini baru saja dinotifikasi (via in-memory set)
    if (recentlyNotifiedDevices.has(identityKey)) {
      console.log(
        `[RepeatDetection] Mengabaikan ${identityKey}, notifikasi baru saja terkirim.`
      );
      continue;
    }

    // 4. Cek apakah log BARU ini memenuhi syarat (lebih dari 1x dalam 15 DETIK)
    const firstDetection = detections[0];
    const lastDetection = detections[detections.length - 1];
    const durationMs =
      lastDetection.created_at!.getTime() - firstDetection.created_at!.getTime();
    const durationSeconds = durationMs / 1000;

    if (detections.length >= 2 && durationSeconds <= 15) {
      console.log(
        `[RepeatDetection] Terdeteksi pengulangan untuk ${identityKey} dalam ${durationSeconds.toFixed(1)} detik! Mengirim notifikasi...`
      );

      const device = firstDetection.device;
      const area = device.area;
      const warehouse = area.warehouse;

      // 5. Kirim notifikasi
      const telegramTask = (async () => {
        try {
          const locationLabel = `${warehouse.name} ${area.name}`;
          const message = `
<b>PERINGATAN KEAMANAN</b>

<b>Lokasi:</b> ${locationLabel}
<b>Kamera:</b> ${device.name}
<b>Identitas:</b> Deteksi berulang

<b>Detail Deteksi:</b>
  • Deteksi pertama: ${formatTimestampWIB(firstDetection.created_at!)}
  • Deteksi terakhir: ${formatTimestampWIB(lastDetection.created_at!)}

<b>Gambar:</b> ${lastDetection.image_url}

<i>Orang yang sama terdeteksi berulang dalam 15 detik!</i>
`.trim();

          await telegramService.sendGroupAlert(message);
          console.log('[RepeatDetection] Telegram notification sent to group.');
        } catch (error) {
          console.error(
            '[RepeatDetection] Telegram notification failed:',
            error
          );
        }
      })();

      await telegramTask;

      // 8. Tandai device ini sebagai sudah dinotifikasi dalam set in-memory
      recentlyNotifiedDevices.add(identityKey);
      setTimeout(() => {
        recentlyNotifiedDevices.delete(identityKey);
      }, REPEAT_WINDOW_MINUTES * 60 * 1000);
    }
  }
};
