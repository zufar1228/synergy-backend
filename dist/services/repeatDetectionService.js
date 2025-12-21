"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.findAndNotifyRepeatDetections = void 0;
// backend/src/services/repeatDetectionService.ts
const models_1 = require("../db/models");
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const notificationService_1 = require("./notificationService");
const telegramService = __importStar(require("./telegramService")); // <-- ADD TELEGRAM IMPORT
const sequelize_1 = require("sequelize");
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
const REPEAT_WINDOW_MINUTES = 15;
/**
 * Mengubah JSON atribut mentah dari Python menjadi string kunci yang konsisten.
 * Input: [ { "attribute": "person wearing a blue shirt", ... }, { "attribute": "person wearing a hat", ... } ]
 * Output: "baju-biru_memakai-topi"
 */
function getIdentityKey(attributes) {
    if (!attributes || attributes.length === 0)
        return "unknown";
    return attributes
        .map((attr) => attr.attribute
        .replace("person wearing a ", "baju-")
        .replace("person not wearing a ", "tanpa-")
        .replace(" shirt", "")
        .replace(" hat", "-topi")
        .replace(" glasses", "-kacamata"))
        .sort() // Sortir agar urutannya konsisten
        .join("_");
}
/**
 * Layanan utama untuk mencari dan memberi notifikasi deteksi berulang
 */
const findAndNotifyRepeatDetections = async () => {
    // 1. Cari semua log deteksi baru yang belum diproses notifikasinya
    const newDetections = await models_1.KeamananLog.findAll({
        where: {
            detected: true,
            notification_sent_at: null,
            status: "unacknowledged",
        },
        include: [
            {
                model: models_1.Device,
                as: "device",
                include: [
                    {
                        model: models_1.Area,
                        as: "area",
                        include: [{ model: models_1.Warehouse, as: "warehouse" }],
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
    const detectionMap = new Map();
    for (const detection of newDetections) {
        const identityKey = `${detection.device_id}_${getIdentityKey(detection.attributes)}`;
        if (!detectionMap.has(identityKey)) {
            detectionMap.set(identityKey, []);
        }
        detectionMap.get(identityKey).push(detection);
    }
    // 2. Proses setiap grup identitas
    for (const [identityKey, detections] of detectionMap.entries()) {
        // 3. Cek apakah ada log LAMA (sudah dinotifikasi) dengan kunci yang sama dalam 15 menit terakhir
        // Ini untuk mencegah spam jika notifikasi baru saja dikirim
        const recentNotifiedCount = await models_1.KeamananLog.count({
            where: {
                id: { [sequelize_1.Op.notIn]: detections.map((d) => d.id) }, // Bukan log yang sedang kita proses
                device_id: detections[0].device_id,
                attributes: { [sequelize_1.Op.eq]: detections[0].attributes }, // Mencocokkan atribut
                notification_sent_at: { [sequelize_1.Op.ne]: null }, // Yang SUDAH dinotifikasi
                created_at: {
                    [sequelize_1.Op.gt]: new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60 * 1000),
                },
            },
        });
        if (recentNotifiedCount > 0) {
            // Notifikasi untuk orang ini sudah dikirim baru-baru ini. Tandai log baru & abaikan.
            await models_1.KeamananLog.update({ notification_sent_at: new Date() }, { where: { id: { [sequelize_1.Op.in]: detections.map((d) => d.id) } } });
            console.log(`[RepeatDetection] Mengabaikan ${identityKey}, notifikasi baru saja terkirim.`);
            continue;
        }
        // 4. Jika tidak ada notifikasi baru, cek apakah log BARU ini memenuhi syarat (lebih dari 1x dalam 15 menit)
        const firstDetection = detections[0];
        const lastDetection = detections[detections.length - 1];
        const duration = (0, date_fns_1.differenceInMinutes)(lastDetection.created_at, firstDetection.created_at);
        if (detections.length > 1 && duration <= REPEAT_WINDOW_MINUTES) {
            // KITA PUNYA DETEKSI BERULANG!
            console.log(`[RepeatDetection] Terdeteksi pengulangan untuk ${identityKey}! Mengirim notifikasi...`);
            const device = firstDetection.get("device");
            const area = device.get("area");
            const warehouse = area.get("warehouse");
            // 5. Kirim notifikasi
            const emailProps = {
                warehouseName: warehouse.name,
                areaName: area.name,
                attributes: getIdentityKey(firstDetection.attributes).replace(/_/g, ", "),
                detectionCount: detections.length,
                durationMinutes: duration,
                firstSeen: (0, date_fns_1.format)(firstDetection.created_at, "dd MMM yyyy, HH:mm:ss", {
                    locale: locale_1.id,
                }),
                lastSeen: (0, date_fns_1.format)(lastDetection.created_at, "dd MMM yyyy, HH:mm:ss", {
                    locale: locale_1.id,
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
👤 <b>Identitas:</b> ${getIdentityKey(firstDetection.attributes).replace(/_/g, ", ")}

📊 <b>Detail Deteksi:</b>
   • Jumlah deteksi: ${detections.length}x
   • Durasi: ${duration} menit
   • Deteksi pertama: ${(0, date_fns_1.format)(firstDetection.created_at, "dd MMM yyyy, HH:mm:ss", { locale: locale_1.id })}
   • Deteksi terakhir: ${(0, date_fns_1.format)(lastDetection.created_at, "dd MMM yyyy, HH:mm:ss", { locale: locale_1.id })}

🖼️ <b>Gambar:</b> ${lastDetection.image_url}

<i>Orang yang sama terdeteksi berulang kali dalam waktu singkat.</i>
`.trim();
                    await telegramService.sendGroupAlert(message);
                    console.log("[RepeatDetection] Telegram notification sent to group.");
                }
                catch (error) {
                    console.error("[RepeatDetection] Telegram notification failed:", error);
                }
            })();
            // 6. Dapatkan daftar penerima notifikasi
            // (Logika ini sudah kita buat di alertingService, kita pinjam di sini)
            const userIds = (await models_1.UserNotificationPreference.findAll({
                where: { system_type: "keamanan", is_enabled: true },
                attributes: ["user_id"],
            })).map((sub) => sub.user_id);
            const { data: { users }, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
            const subscribedUsers = users
                .filter((user) => userIds.includes(user.id))
                .map((user) => ({ email: user.email }));
            // 7. Kirim email ke semua pelanggan
            for (const user of subscribedUsers) {
                await (0, notificationService_1.sendRepeatAlertEmail)({ to: user.email, subject, emailProps });
            }
            // Wait for Telegram notification to complete
            await telegramTask;
            // 8. Tandai semua log ini sebagai sudah dinotifikasi
            await models_1.KeamananLog.update({ notification_sent_at: new Date() }, { where: { id: { [sequelize_1.Op.in]: detections.map((d) => d.id) } } });
        }
        // Jika hanya ada 1 deteksi, biarkan (jangan tandai) agar bisa dicek lagi di job berikutnya
    }
};
exports.findAndNotifyRepeatDetections = findAndNotifyRepeatDetections;
