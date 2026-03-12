// backend/src/services/repeatDetectionService.ts
import { KeamananLog, Device, Area, Warehouse } from '../db/models';
import * as telegramService from './telegramService';
import { Op } from 'sequelize';
import { formatTimestampWIB } from '../utils/time';

const REPEAT_WINDOW_MINUTES = 15;

/**
 * Mengubah JSON atribut mentah dari Python menjadi string kunci yang konsisten.
 * Input: [ { "attribute": "person wearing a blue shirt", ... }, { "attribute": "person wearing a hat", ... } ]
 * Output: "baju-biru_memakai-topi"
 */
function getIdentityKey(attributes: any[] | null): string {
  if (!attributes || attributes.length === 0) return 'unknown';

  // Flatten attributes to handle both nested and flat structures
  const flatAttributes: any[] = [];

  attributes.forEach((person: any) => {
    if (person.attributes && Array.isArray(person.attributes)) {
      // Nested structure: { attributes: [{ attribute: "..." }] }
      flatAttributes.push(...person.attributes);
    } else if (person.attribute) {
      // Flat structure: { attribute: "..." }
      flatAttributes.push(person);
    }
  });

  if (flatAttributes.length === 0) return 'unknown';

  return flatAttributes
    .map((attr: any) => {
      if (!attr.attribute) return '';
      return attr.attribute
        .replace('person wearing a ', 'baju-')
        .replace('person not wearing a ', 'tanpa-')
        .replace(' shirt', '')
        .replace(' hat', '-topi')
        .replace(' glasses', '-kacamata');
    })
    .filter((attr) => attr.length > 0)
    .sort()
    .join('_');
}

/**
 * Layanan utama untuk mencari dan memberi notifikasi deteksi berulang
 */
export const findAndNotifyRepeatDetections = async () => {
  // 1. Cari semua log deteksi baru yang belum diproses notifikasinya
  const newDetections = await KeamananLog.findAll({
    where: {
      detected: true,
      notification_sent_at: null,
      status: 'unacknowledged'
    },
    include: [
      {
        model: Device,
        as: 'device',
        include: [
          {
            model: Area,
            as: 'area',
            include: [{ model: Warehouse, as: 'warehouse' }]
          }
        ]
      }
    ],
    order: [['created_at', 'ASC']]
  });

  if (newDetections.length === 0) {
    console.log('[RepeatDetection] Tidak ada deteksi baru untuk diproses.');
    return;
  }

  // Gunakan Map untuk mengelompokkan log berdasarkan "kunci identitas"
  const detectionMap = new Map<string, KeamananLog[]>();

  for (const detection of newDetections) {
    const identityKey = `${detection.device_id}_${getIdentityKey(
      detection.attributes as any[]
    )}`;
    if (!detectionMap.has(identityKey)) {
      detectionMap.set(identityKey, []);
    }
    detectionMap.get(identityKey)!.push(detection);
  }

  // 2. Proses setiap grup identitas
  for (const [identityKey, detections] of detectionMap.entries()) {
    // 3. Cek apakah ada log LAMA (sudah dinotifikasi) dengan kunci yang sama dalam 15 DETIK terakhir
    // Ini untuk mencegah spam jika notifikasi baru saja dikirim
    const recentNotifiedCount = await KeamananLog.count({
      where: {
        id: { [Op.notIn]: detections.map((d) => d.id) }, // Bukan log yang sedang kita proses
        device_id: detections[0].device_id,
        attributes: { [Op.eq]: detections[0].attributes }, // Mencocokkan atribut
        notification_sent_at: { [Op.ne]: null }, // Yang SUDAH dinotifikasi
        created_at: {
          [Op.gt]: new Date(Date.now() - 15 * 1000) // 15 DETIK, bukan menit
        }
      }
    });

    if (recentNotifiedCount > 0) {
      // Notifikasi untuk orang ini sudah dikirim baru-baru ini. Tandai log baru & abaikan.
      await KeamananLog.update(
        { notification_sent_at: new Date() },
        { where: { id: { [Op.in]: detections.map((d) => d.id) } } }
      );
      console.log(
        `[RepeatDetection] Mengabaikan ${identityKey}, notifikasi baru saja terkirim.`
      );
      continue;
    }

    // 4. Jika tidak ada notifikasi baru, cek apakah log BARU ini memenuhi syarat (lebih dari 1x dalam 15 DETIK)
    const firstDetection = detections[0];
    const lastDetection = detections[detections.length - 1];
    const durationMs =
      lastDetection.created_at.getTime() - firstDetection.created_at.getTime();
    const durationSeconds = durationMs / 1000;

    if (detections.length >= 2 && durationSeconds <= 15) {
      // KITA PUNYA DETEKSI BERULANG DALAM 15 DETIK!
      console.log(
        `[RepeatDetection] Terdeteksi pengulangan untuk ${identityKey} dalam ${durationSeconds.toFixed(1)} detik! Mengirim notifikasi...`
      );

      const device = firstDetection.get('device') as Device;
      const area = device.get('area') as Area;
      const warehouse = area.get('warehouse') as Warehouse;

      // 5. Kirim notifikasi
      const emailProps = {
        warehouseName: warehouse.name,
        areaName: area.name,
        attributes: getIdentityKey(firstDetection.attributes as any[]).replace(
          /_/g,
          ', '
        ),
        detectionCount: detections.length,
        durationMinutes: durationSeconds / 60, // Convert to minutes for email
        firstSeen: formatTimestampWIB(firstDetection.created_at),
        lastSeen: formatTimestampWIB(lastDetection.created_at),
        imageUrl: lastDetection.image_url
      };

      const subject = `[PERINGATAN] Orang yang Sama Terdeteksi Berulang Kali di ${warehouse.name} - ${area.name}`;

      // === ADD TELEGRAM NOTIFICATION ===
      const telegramTask = (async () => {
        try {
          const message = `
🚨 <b>PERINGATAN KEAMANAN</b> 🚨

📍 <b>Lokasi:</b> ${warehouse.name} - ${area.name}
🔧 <b>Device:</b> ${device.name}
👤 <b>Identitas:</b> ${getIdentityKey(firstDetection.attributes as any[]).replace(/_/g, ', ')}

📊 <b>Detail Deteksi:</b>
  • Deteksi pertama: ${formatTimestampWIB(firstDetection.created_at)}
  • Deteksi terakhir: ${formatTimestampWIB(lastDetection.created_at)}

🖼️ <b>Gambar:</b> ${lastDetection.image_url}

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

      // Wait for Telegram notification to complete
      await telegramTask;

      // 8. Tandai semua log ini sebagai sudah dinotifikasi
      await KeamananLog.update(
        { notification_sent_at: new Date() },
        { where: { id: { [Op.in]: detections.map((d) => d.id) } } }
      );
    }
    // Jika hanya ada 1 deteksi, biarkan (jangan tandai) agar bisa dicek lagi di job berikutnya
  }
};
