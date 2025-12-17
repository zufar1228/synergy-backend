// backend/src/services/alertingService.ts
import {
  Device,
  Area,
  Warehouse,
  UserNotificationPreference,
  Profile,
} from "../db/models";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { sendAlertEmail, sendAllClearEmail } from "./notificationService"; // <-- IMPORT BARU
import * as actuationService from "./actuationService"; // <-- IMPORT BARU
import * as webPushService from "./webPushService"; // <-- IMPORT PUSH
import * as telegramService from "./telegramService"; // <-- IMPORT TELEGRAM
import { format } from "date-fns";
import { id as localeID } from "date-fns/locale";
import ApiError from "../utils/apiError";

// Definisikan tipe untuk hasil query eager-loading
interface DeviceWithRelations extends Device {
  area: Area & {
    warehouse: Warehouse;
  };
}
const THRESHOLDS = {
  lingkungan: {
    temp: { max: 40 }, // Suhu maks 40°C
    co2: { max: 1500 }, // CO2 maks 1500 ppm
  },
};

// ============================================================================
// IN-MEMORY CACHE untuk melacak status alert terakhir per device
// Ini membantu mengatasi race condition dengan simulator yang mengupdate DB langsung
// ============================================================================
const deviceAlertState: Map<string, { 
  wasAlertTriggered: boolean; 
  notificationSentAt?: Date;
}> = new Map();

/**
 * Mengirim notifikasi (email, push, dan Telegram) ke semua pengguna yang berlangganan
 */
const notifySubscribers = async (
  systemType: string,
  subject: string,
  emailProps: any,
  emailFunction: (params: any) => Promise<void>
) => {
  // 1. Ambil User ID yang subscribe
  const userIds = (
    await UserNotificationPreference.findAll({
      where: { system_type: systemType, is_enabled: true },
      attributes: ["user_id"],
    })
  ).map((sub) => sub.user_id);

  if (userIds.length === 0) return;

  // === TASK 1: SIAPKAN PUSH NOTIFICATION ===
  const pushTask = (async () => {
    console.log(`[Alerting] Starting push task for ${userIds.length} users:`, userIds);
    const pushTitle = subject.includes("PERINGATAN")
      ? "🚨 BAHAYA TERDETEKSI"
      : "✅ KEMBALI NORMAL";
    const pushBody = `Lokasi: ${emailProps.warehouseName} - ${
      emailProps.areaName
    }. ${emailProps.incidentType || "Status Update"}.`;

    // Map menjadi array of promises
    const pushPromises = userIds.map((userId) =>
      webPushService.sendPushNotification(userId, {
        title: pushTitle,
        body: pushBody,
        url: `/dashboard`,
      })
    );
    // Jalankan paralel
    await Promise.all(pushPromises);
    console.log("[Alerting] All push notifications processed.");
  })();

  // === TASK 2: SIAPKAN EMAIL ===
  const emailTask = (async () => {
    try {
      const {
        data: { users },
      } = await supabaseAdmin.auth.admin.listUsers();
      const subscribedUsers = users
        .filter((user) => userIds.includes(user.id))
        .map((user) => ({ email: user.email! }));

      const emailPromises = subscribedUsers.map((user) =>
        emailFunction({ to: user.email, subject, emailProps })
      );
      await Promise.all(emailPromises);
      console.log("[Alerting] All emails processed.");
    } catch (error) {
      console.error("[Alerting] Email processing failed:", error);
    }
  })();

  // === TASK 3: KIRIM KE TELEGRAM GROUP ===
  const telegramTask = (async () => {
    try {
      const isAlert = subject.includes("PERINGATAN");
      const emoji = isAlert ? "🚨" : "✅";
      const statusText = isAlert ? "PERINGATAN BAHAYA" : "KEMBALI NORMAL";
      
      // Build detail text from emailProps.details if available
      let detailText = "";
      if (emailProps.details && Array.isArray(emailProps.details)) {
        detailText = emailProps.details
          .map((d: { key: string; value: string }) => `   • ${d.key}: ${d.value}`)
          .join("\n");
      }

      const message = `
${emoji} <b>${statusText}</b> ${emoji}

📍 <b>Lokasi:</b> ${emailProps.warehouseName} - ${emailProps.areaName}
🔧 <b>Device:</b> ${emailProps.deviceName}
${emailProps.incidentType ? `⚠️ <b>Tipe:</b> ${emailProps.incidentType}` : ""}
${detailText ? `\n📊 <b>Detail:</b>\n${detailText}` : ""}

🕐 <b>Waktu:</b> ${emailProps.timestamp}

<i>Harap segera diperiksa.</i>
`.trim();

      await telegramService.sendGroupAlert(message);
      console.log("[Alerting] Telegram notification sent.");
    } catch (error) {
      console.error("[Alerting] Telegram notification failed:", error);
    }
  })();

  // === EKSEKUSI SEMUANYA BERSAMAAN ===
  // Push, Email, dan Telegram jalan paralel
  await Promise.all([pushTask, emailTask, telegramTask]);
};

/**
 * Memproses data sensor, membandingkan dengan ambang batas, dan mengontrol aktuator
 */
export const processSensorDataForAlerts = async (
  deviceId: string,
  systemType: string,
  data: any
) => {
  if (systemType !== "lingkungan") return;

  const { temp, co2_ppm } = data;
  console.log(
    `[Alerting] Menerima data untuk ${deviceId}: Temp=${temp}, CO2=${co2_ppm}`
  ); // <-- LOG 1

  if (temp === undefined && co2_ppm === undefined) {
    console.log("[Alerting] Data tidak lengkap (temp/co2 tidak ada). Keluar.");
    return;
  }

  // 1. Dapatkan status perangkat saat ini (termasuk status kipas)
  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: "area",
        include: [{ model: Warehouse, as: "warehouse" }],
      },
    ],
  })) as DeviceWithRelations | null;

  if (!device) {
    console.error(
      `[Alerting] GAGAL: Perangkat dengan ID ${deviceId} tidak ditemukan.`
    );
    return;
  }
  if (!device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Relasi Area/Gudang untuk perangkat ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area, fan_status } = device;
  const { warehouse } = area;

  // 2. Tentukan kondisi berdasarkan sensor values (BUKAN fan_status!)
  const tempLimit = THRESHOLDS.lingkungan.temp.max;
  const co2Limit = THRESHOLDS.lingkungan.co2.max;

  const isAlertTriggered = temp > tempLimit || co2_ppm > co2Limit;
  
  // Ambil state sebelumnya dari cache
  const previousState = deviceAlertState.get(deviceId);
  const wasAlertTriggered = previousState?.wasAlertTriggered ?? false;

  console.log(
    `[Alerting] Status saat ini: Alert=${isAlertTriggered}, WasAlert=${wasAlertTriggered}, DB fan_status=${device.fan_status}`
  );

  const timestamp = format(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
    locale: localeID,
  });

  // 3. Terapkan Logika Kontrol berdasarkan TRANSISI state
  // Kondisi ALERT: Sekarang alert terpicu DAN sebelumnya tidak alert
  // Kondisi NORMAL: Sekarang tidak alert DAN sebelumnya alert
  console.log(`[Alerting] DEBUG: isAlertTriggered=${isAlertTriggered}, wasAlertTriggered=${wasAlertTriggered}`);
  console.log(`[Alerting] DEBUG: Condition for ALERT: isAlertTriggered=${isAlertTriggered} && !wasAlertTriggered=${!wasAlertTriggered} → ${isAlertTriggered && !wasAlertTriggered}`);
  console.log(`[Alerting] DEBUG: Condition for NORMAL: !isAlertTriggered=${!isAlertTriggered} && wasAlertTriggered=${wasAlertTriggered} → ${!isAlertTriggered && wasAlertTriggered}`);
  
  if (isAlertTriggered && !wasAlertTriggered) {
    // --- KONDISI: TRANSISI KE ALERT (baru saja melewati threshold) ---
    console.log(
      `[Alerting] 🚨 PERINGATAN terpicu untuk ${device.name}. Menyalakan kipas...`
    );

    // Update cache DULU agar tidak double-trigger
    deviceAlertState.set(deviceId, { wasAlertTriggered: true, notificationSentAt: new Date() });

    // Tentukan detail peringatan
    let incidentType =
      temp > tempLimit ? "Suhu Terlalu Tinggi" : "Kadar CO2 Tinggi";
    let details =
      temp > tempLimit
        ? [
            { key: "Suhu", value: `${temp}°C` },
            { key: "Batas", value: `${tempLimit}°C` },
          ]
        : [
            { key: "CO2", value: `${co2_ppm} ppm` },
            { key: "Batas", value: `${co2Limit} ppm` },
          ];

    // a. Kirim Perintah 'On' (jika belum On)
    if (device.fan_status !== "On") {
      console.log(`[Alerting] 🚨 Sending fan ON command...`);
      await actuationService.controlFanRelay(deviceId, "On");
      console.log(`[Alerting] 🚨 Fan ON command sent!`);
    } else {
      console.log(`[Alerting] 🚨 Fan already ON in DB, skipping actuation.`);
    }
    
    console.log(`[Alerting] 🚨 Now sending ALERT notifications...`);

    // b. Kirim Notifikasi Peringatan
    const emailProps = {
      incidentType,
      warehouseName: warehouse.name,
      areaName: area.name,
      deviceName: device.name,
      timestamp,
      details,
    };
    const subject = `[PERINGATAN Kritis] Terdeteksi ${incidentType} di ${warehouse.name}`;
    
    try {
      console.log(`[Alerting] 🚨 Calling notifySubscribers for ALERT...`);
      await notifySubscribers("lingkungan", subject, emailProps, sendAlertEmail);
      console.log(`[Alerting] 🚨 notifySubscribers for ALERT completed!`);
    } catch (err) {
      console.error(`[Alerting] ❌ Error in notifySubscribers for ALERT:`, err);
    }
  } else if (!isAlertTriggered && wasAlertTriggered) {
    // --- KONDISI: TRANSISI KE NORMAL (kembali di bawah threshold) ---
    console.log(
      `[Alerting] ✅ NORMAL kembali untuk ${device.name}. Mematikan kipas...`
    );

    // Update cache DULU
    deviceAlertState.set(deviceId, { wasAlertTriggered: false });

    // a. Kirim Perintah 'Off' (jika belum Off)
    if (device.fan_status !== "Off") {
      console.log(`[Alerting] ✅ Sending fan OFF command...`);
      await actuationService.controlFanRelay(deviceId, "Off");
      console.log(`[Alerting] ✅ Fan OFF command sent!`);
    } else {
      console.log(`[Alerting] ✅ Fan already OFF in DB, skipping actuation.`);
    }
    
    console.log(`[Alerting] ✅ Now sending NORMAL notifications...`);

    // b. Kirim Notifikasi "Kembali Normal"
    const emailProps = {
      warehouseName: warehouse.name,
      areaName: area.name,
      deviceName: device.name,
      timestamp,
    };
    const subject = `[Info] Sistem Lingkungan di ${warehouse.name} Kembali Normal`;
    
    try {
      console.log(`[Alerting] ✅ Calling notifySubscribers for NORMAL...`);
      await notifySubscribers(
        "lingkungan",
        subject,
        emailProps,
        sendAllClearEmail
      );
      console.log(`[Alerting] ✅ notifySubscribers for NORMAL completed!`);
    } catch (err) {
      console.error(`[Alerting] ❌ Error in notifySubscribers for NORMAL:`, err);
    }
  } else {
    // --- KONDISI STABIL ---
    // Update cache to keep it in sync
    if (isAlertTriggered !== wasAlertTriggered) {
      deviceAlertState.set(deviceId, { wasAlertTriggered: isAlertTriggered });
    }
    console.log("[Alerting] Kondisi stabil. Tidak ada aksi diperlukan.");
  }
};

/**
 * Memproses alert dari TinyML Intrusion Detection
 * Hanya dipanggil ketika event "Intrusion" terdeteksi
 */
export const processIntrusiAlert = async (
  deviceId: string,
  device: any,
  data: { event: string; conf: number; ts?: string }
) => {
  const { area } = device;
  const { warehouse } = area;

  const timestamp = format(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
    locale: localeID,
  });

  const confidencePercent = (data.conf * 100).toFixed(1);

  const emailProps = {
    incidentType: "UPAYA INTRUSI TERDETEKSI (TinyML)",
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details: [
      { key: "Tipe Event", value: data.event },
      { key: "Confidence", value: `${confidencePercent}%` },
      { key: "Sistem", value: "TinyML Edge AI (ESP32)" },
    ],
  };

  const subject = `[🚨 INTRUSI] Terdeteksi Percobaan Penyusupan di ${warehouse.name}`;

  console.log(`[Alerting-Intrusi] 🚨 Sending intrusion alert for device ${device.name}...`);

  try {
    await notifySubscribers("intrusi", subject, emailProps, sendAlertEmail);
    console.log(`[Alerting-Intrusi] ✅ Intrusion alert sent successfully!`);
  } catch (error) {
    console.error(`[Alerting-Intrusi] ❌ Error sending intrusion alert:`, error);
  }
};

/**
 * Memproses alert dari Proteksi Aset System (ML-based detection)
 * Dipanggil untuk IMPACT, WATER_LEAK, dan insiden bahaya lainnya
 */
export const processProteksiAsetAlert = async (
  deviceId: string,
  incidentType: string,
  rawData: {
    sensorId: string;
    type: string;
    data: Record<string, unknown>;
  }
) => {
  // Ambil device dengan relasi
  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: "area",
        include: [{ model: Warehouse, as: "warehouse" }],
      },
    ],
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(`[Alerting-ProteksiAset] Device ${deviceId} not found or missing relations`);
    return;
  }

  const { area } = device;
  const { warehouse } = area;

  const timestamp = format(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
    locale: localeID,
  });

  // Build details based on incident type
  const details: { key: string; value: string }[] = [];

  if (incidentType === "IMPACT") {
    details.push(
      { key: "Tipe Insiden", value: "BENTURAN KERAS (Impact)" },
      { key: "Akselerometer X", value: `${rawData.data.accX || 0} g` },
      { key: "Akselerometer Y", value: `${rawData.data.accY || 0} g` },
      { key: "Akselerometer Z", value: `${rawData.data.accZ || 0} g` },
      { key: "Level Suara", value: `${rawData.data.mic_level || 0}` }
    );
  } else if (incidentType === "WATER_LEAK") {
    const waterLevel = rawData.data.water_level as number || 0;
    const estimatedMm = ((waterLevel - 500) * 48 / 3595).toFixed(1);
    details.push(
      { key: "Tipe Insiden", value: "KEBOCORAN AIR (Water Leak)" },
      { key: "Level Sensor", value: `${waterLevel}` },
      { key: "Estimasi Ketinggian", value: `${estimatedMm} mm` }
    );
  } else if (incidentType === "VIBRATION") {
    details.push(
      { key: "Tipe Insiden", value: "GETARAN TINGGI (Vibration)" },
      { key: "Akselerometer X", value: `${rawData.data.accX || 0} g` }
    );
  } else if (incidentType === "THERMAL") {
    const thermalData = rawData.data.thermal_data as number[] || [];
    const avg = thermalData.length > 0 
      ? (thermalData.reduce((a, b) => a + b, 0) / thermalData.length).toFixed(1) 
      : "N/A";
    const max = thermalData.length > 0 ? Math.max(...thermalData).toFixed(1) : "N/A";
    details.push(
      { key: "Tipe Insiden", value: "SUHU TINGGI (Thermal)" },
      { key: "Suhu Rata-rata", value: `${avg}°C` },
      { key: "Suhu Maksimal", value: `${max}°C` }
    );
  }

  details.push({ key: "Sistem", value: "Proteksi Aset (ML Detection)" });

  const incidentLabels: Record<string, string> = {
    IMPACT: "BENTURAN KERAS",
    WATER_LEAK: "KEBOCORAN AIR", 
    VIBRATION: "GETARAN TINGGI",
    THERMAL: "SUHU TINGGI",
  };

  const emailProps = {
    incidentType: `${incidentLabels[incidentType] || incidentType} TERDETEKSI`,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details,
  };

  const emoji = ["IMPACT", "WATER_LEAK"].includes(incidentType) ? "🚨" : "⚠️";
  const subject = `[${emoji} PROTEKSI ASET] ${incidentLabels[incidentType] || incidentType} di ${warehouse.name}`;

  console.log(`[Alerting-ProteksiAset] ${emoji} Sending ${incidentType} alert for device ${device.name}...`);

  try {
    await notifySubscribers("proteksi_aset", subject, emailProps, sendAlertEmail);
    console.log(`[Alerting-ProteksiAset] ✅ Alert sent successfully!`);
  } catch (error) {
    console.error(`[Alerting-ProteksiAset] ❌ Error sending alert:`, error);
  }
};
