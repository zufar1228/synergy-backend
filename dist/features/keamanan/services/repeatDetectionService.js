"use strict";
/**
 * @file repeatDetectionService.ts
 * @purpose Detects repeated unresolved keamanan events within time window and sends Telegram alerts
 * @usedBy keamananController, repeatDetectionJob
 * @deps db/drizzle, schema (keamanan_logs, devices), telegramService, time util
 * @exports findAndNotifyRepeatDetections
 * @sideEffects DB read (keamanan_logs), Telegram API call
 */
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
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const telegramService = __importStar(require("../../../services/telegramService"));
const time_1 = require("../../../utils/time");
const REPEAT_WINDOW_MINUTES = 15;
/**
 * Mengubah JSON atribut mentah dari Python menjadi string kunci yang konsisten.
 */
function getIdentityKey(attributes) {
    if (!attributes || attributes.length === 0)
        return 'unknown';
    const flatAttributes = [];
    attributes.forEach((person) => {
        if (person.attributes && Array.isArray(person.attributes)) {
            flatAttributes.push(...person.attributes);
        }
        else if (person.attribute) {
            flatAttributes.push(person);
        }
    });
    if (flatAttributes.length === 0)
        return 'unknown';
    return flatAttributes
        .map((attr) => {
        if (!attr.attribute)
            return '';
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
const findAndNotifyRepeatDetections = async () => {
    // 1. Cari semua log deteksi baru yang belum diproses notifikasinya
    const newDetections = await drizzle_1.db.query.keamanan_logs.findMany({
        where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.keamanan_logs.detected, true), (0, drizzle_orm_1.isNull)(schema_1.keamanan_logs.notification_sent_at), (0, drizzle_orm_1.eq)(schema_1.keamanan_logs.status, 'unacknowledged')),
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
        // 3. Cek apakah ada log LAMA (sudah dinotifikasi) dengan kunci yang sama dalam 15 DETIK terakhir
        const detectionIds = detections.map((d) => d.id);
        const recentNotified = await drizzle_1.db
            .select({ id: schema_1.keamanan_logs.id })
            .from(schema_1.keamanan_logs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(schema_1.keamanan_logs.id, detections[0].id), // Simplified: exclude first
        (0, drizzle_orm_1.eq)(schema_1.keamanan_logs.device_id, detections[0].device_id), 
        // Note: JSON equality check — we match on device_id + identity key logic instead
        (0, drizzle_orm_1.gt)(schema_1.keamanan_logs.notification_sent_at, new Date(0)), // not null
        (0, drizzle_orm_1.gt)(schema_1.keamanan_logs.created_at, new Date(Date.now() - 15 * 1000))))
            .limit(1);
        if (recentNotified.length > 0) {
            // Notifikasi untuk orang ini sudah dikirim baru-baru ini. Tandai log baru & abaikan.
            await drizzle_1.db
                .update(schema_1.keamanan_logs)
                .set({ notification_sent_at: new Date() })
                .where((0, drizzle_orm_1.inArray)(schema_1.keamanan_logs.id, detectionIds));
            console.log(`[RepeatDetection] Mengabaikan ${identityKey}, notifikasi baru saja terkirim.`);
            continue;
        }
        // 4. Cek apakah log BARU ini memenuhi syarat (lebih dari 1x dalam 15 DETIK)
        const firstDetection = detections[0];
        const lastDetection = detections[detections.length - 1];
        const durationMs = lastDetection.created_at.getTime() - firstDetection.created_at.getTime();
        const durationSeconds = durationMs / 1000;
        if (detections.length >= 2 && durationSeconds <= 15) {
            console.log(`[RepeatDetection] Terdeteksi pengulangan untuk ${identityKey} dalam ${durationSeconds.toFixed(1)} detik! Mengirim notifikasi...`);
            const device = firstDetection.device;
            const area = device.area;
            const warehouse = area.warehouse;
            // 5. Kirim notifikasi
            const telegramTask = (async () => {
                try {
                    const message = `
🚨 <b>PERINGATAN KEAMANAN</b> 🚨

📍 <b>Lokasi:</b> ${warehouse.name} - ${area.name}
🔧 <b>Device:</b> ${device.name}
👤 <b>Identitas:</b> ${getIdentityKey(firstDetection.attributes).replace(/_/g, ', ')}

📊 <b>Detail Deteksi:</b>
  • Deteksi pertama: ${(0, time_1.formatTimestampWIB)(firstDetection.created_at)}
  • Deteksi terakhir: ${(0, time_1.formatTimestampWIB)(lastDetection.created_at)}

🖼️ <b>Gambar:</b> ${lastDetection.image_url}

<i>Orang yang sama terdeteksi berulang dalam 15 detik!</i>
`.trim();
                    await telegramService.sendGroupAlert(message);
                    console.log('[RepeatDetection] Telegram notification sent to group.');
                }
                catch (error) {
                    console.error('[RepeatDetection] Telegram notification failed:', error);
                }
            })();
            await telegramTask;
            // 8. Tandai semua log ini sebagai sudah dinotifikasi
            await drizzle_1.db
                .update(schema_1.keamanan_logs)
                .set({ notification_sent_at: new Date() })
                .where((0, drizzle_orm_1.inArray)(schema_1.keamanan_logs.id, detectionIds));
        }
    }
};
exports.findAndNotifyRepeatDetections = findAndNotifyRepeatDetections;
