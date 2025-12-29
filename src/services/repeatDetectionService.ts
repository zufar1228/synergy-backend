// backend/src/services/repeatDetectionService.ts
import {
  KeamananLog,
  Device,
  Area,
  Warehouse,
  UserNotificationPreference,
  Profile,
} from "../db/models";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { sendRepeatAlertEmail } from "./notificationService";
import * as telegramService from "./telegramService"; // <-- ADD TELEGRAM IMPORT
import { Op, literal } from "sequelize";
import { format, differenceInMinutes } from "date-fns";
import { id as localeID } from "date-fns/locale";

const REPEAT_WINDOW_MINUTES = 15;

/**
 * Mengubah JSON atribut mentah dari Python menjadi string kunci yang konsisten.
 * Input: [ { "attribute": "person wearing a blue shirt", ... }, { "attribute": "person wearing a hat", ... } ]
 * Output: "baju-biru_memakai-topi"
 */
function getIdentityKey(attributes: any[] | null): string {
  if (!attributes || attributes.length === 0) return "unknown";

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

  if (flatAttributes.length === 0) return "unknown";

  return flatAttributes
    .map((attr: any) => {
      if (!attr.attribute) return "";
      return attr.attribute
        .replace("person wearing a ", "baju-")
        .replace("person not wearing a ", "tanpa-")
        .replace(" shirt", "")
        .replace(" hat", "-topi")
        .replace(" glasses", "-kacamata");
    })
    .filter(attr => attr.length > 0)
    .sort()
    .join("_");
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
      status: "unacknowledged",
    },
    include: [
      {
        model: Device,
        as: "device",
        include: [
          {
            model: Area,
            as: "area",
            include: [{ model: Warehouse, as: "warehouse" }],
          },
        ],
      },
    ],
    order: [["created_at", "ASC"]],
  });

  if (newDetections.length === 0) {
    console.log("[RepeatDetection] Tidak ada deteksi baru untuk diproses.");
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
    // 3. Cek apakah ada log LAMA (sudah dinotifikasi) dengan kunci yang sama dalam 15 menit terakhir
    // Ini untuk mencegah spam jika notifikasi baru saja dikirim
    const recentNotifiedCount = await KeamananLog.count({
      where: {
        id: { [Op.notIn]: detections.map((d) => d.id) }, // Bukan log yang sedang kita proses
        device_id: detections[0].device_id,
        attributes: { [Op.eq]: detections[0].attributes }, // Mencocokkan atribut
        notification_sent_at: { [Op.ne]: null }, // Yang SUDAH dinotifikasi
        created_at: {
          [Op.gt]: new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60 * 1000),
        },
      },
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

    // 4. Jika tidak ada notifikasi baru, cek apakah log BARU ini memenuhi syarat (lebih dari 1x dalam 15 menit)
    const firstDetection = detections[0];
    const lastDetection = detections[detections.length - 1];
    const duration = differenceInMinutes(
      lastDetection.created_at,
      firstDetection.created_at
    );

    if (detections.length > 1 && duration <= REPEAT_WINDOW_MINUTES) {
      // KITA PUNYA DETEKSI BERULANG!
      console.log(
        `[RepeatDetection] Terdeteksi pengulangan untuk ${identityKey}! Mengirim notifikasi...`
      );

      const device = firstDetection.get("device") as Device;
      const area = device.get("area") as Area;
      const warehouse = area.get("warehouse") as Warehouse;

      // 5. Kirim notifikasi
      const emailProps = {
        warehouseName: warehouse.name,
        areaName: area.name,
        attributes: getIdentityKey(firstDetection.attributes as any[]).replace(
          /_/g,
          ", "
        ),
        detectionCount: detections.length,
        durationMinutes: duration,
        firstSeen: format(firstDetection.created_at, "dd MMM yyyy, HH:mm:ss", {
          locale: localeID,
        }),
        lastSeen: format(lastDetection.created_at, "dd MMM yyyy, HH:mm:ss", {
          locale: localeID,
        }),
        imageUrl: lastDetection.image_url,
      };

      const subject = `[PERINGATAN] Orang yang Sama Terdeteksi Berulang Kali di ${warehouse.name} - ${area.name}`;

      // === ADD TELEGRAM NOTIFICATION ===
      const telegramTask = (async () => {
        try {
          const message = `
🚨 <b>PERINGATAN KEAMANAN</b> 🚨

📍 <b>Lokasi:</b> ${warehouse.name} - ${area.name}
🔧 <b>Device:</b> ${device.name}
👤 <b>Identitas:</b> ${getIdentityKey(firstDetection.attributes as any[]).replace(/_/g, ", ")}

📊 <b>Detail Deteksi:</b>
   • Deteksi pertama: ${format(firstDetection.created_at, "dd MMM yyyy, HH:mm:ss", { locale: localeID })}
   • Deteksi terakhir: ${format(lastDetection.created_at, "dd MMM yyyy, HH:mm:ss", { locale: localeID })}

🖼️ <b>Gambar:</b> ${lastDetection.image_url}

<i>Orang yang sama terdeteksi berulang kali dalam waktu singkat.</i>
`.trim();

          await telegramService.sendGroupAlert(message);
          console.log("[RepeatDetection] Telegram notification sent to group.");
        } catch (error) {
          console.error("[RepeatDetection] Telegram notification failed:", error);
        }
      })();

      // 6. Dapatkan daftar penerima notifikasi
      // (Logika ini sudah kita buat di alertingService, kita pinjam di sini)
      const userIds = (
        await UserNotificationPreference.findAll({
          where: { system_type: "keamanan", is_enabled: true },
          attributes: ["user_id"],
        })
      ).map((sub) => sub.user_id);

      const {
        data: { users },
      } = await supabaseAdmin.auth.admin.listUsers();
      const subscribedUsers = users
        .filter((user) => userIds.includes(user.id))
        .map((user) => ({ email: user.email! }));

      // 7. Kirim email ke semua pelanggan
      for (const user of subscribedUsers) {
        await sendRepeatAlertEmail({ to: user.email, subject, emailProps });
      }

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
