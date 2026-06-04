/**
 * @file repeatDetectionService.ts
 * @purpose Detects repeated unresolved keamanan events within time window and sends Telegram alerts
 * @usedBy keamananController, repeatDetectionJob
 * @deps db/drizzle, schema (keamanan_logs, devices), telegramService, time util
 * @exports findAndNotifyRepeatDetections
 * @sideEffects DB read (keamanan_logs), Telegram API call
 */

import { db } from '../../../db/drizzle';
import { keamanan_logs } from '../../../db/schema';
import { eq, and, gt, ne } from 'drizzle-orm';
import * as telegramService from '../../../services/telegramService';
import { formatTimestampWIB } from '../../../utils/time';

/**
 * Layanan utama untuk mencari dan memberi notifikasi deteksi berulang
 */
export const findAndNotifyRepeatDetections = async () => {
  // 1. Cari semua log deteksi baru yang belum diproses notifikasinya
  const newDetections = await db.query.keamanan_logs.findMany({
    where: and(eq(keamanan_logs.status, 'unacknowledged')),
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

  // Gunakan Map untuk mengelompokkan log berdasarkan "kunci identitas"
  const detectionMap = new Map<string, typeof newDetections>();

  for (const detection of newDetections) {
    const identityKey = `${detection.device_id}_${detection.image_url}`;
    if (!detectionMap.has(identityKey)) {
      detectionMap.set(identityKey, []);
    }
    detectionMap.get(identityKey)!.push(detection);
  }

  // 2. Proses setiap grup identitas
  for (const [identityKey, detections] of detectionMap.entries()) {
    // 3. Cek apakah ada log LAMA (sudah dinotifikasi) dengan kunci yang sama dalam 15 DETIK terakhir
    const detectionIds = detections.map((d) => d.id);
    const recentNotified = await db
      .select({ id: keamanan_logs.id })
      .from(keamanan_logs)
      .where(
        and(
          ne(keamanan_logs.id, detections[0].id), // Simplified: exclude first
          eq(keamanan_logs.device_id, detections[0].device_id),
          gt(keamanan_logs.created_at, new Date(Date.now() - 15 * 1000))
        )
      )
      .limit(1);

    if (recentNotified.length > 0) {
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
          const message = `
<b>PERINGATAN KEAMANAN</b>

<b>Lokasi:</b> ${warehouse.name} - ${area.name}
<b>Device:</b> ${device.name}
<b>Identitas:</b> ${firstDetection.device_id}

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
    }
  }
};
