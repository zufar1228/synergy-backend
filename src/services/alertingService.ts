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

/**
 * Mengirim notifikasi (email) ke semua pengguna yang berlangganan
 */
const notifySubscribers = async (
  systemType: string,
  subject: string,
  emailProps: any,
  emailFunction: (params: any) => Promise<void>
) => {
  const userIds = (
    await UserNotificationPreference.findAll({
      where: { system_type: systemType, is_enabled: true },
      attributes: ["user_id"],
    })
  ).map((sub) => sub.user_id);

  if (userIds.length === 0) return; // Tidak ada yang subscribe

  const {
    data: { users },
  } = await supabaseAdmin.auth.admin.listUsers();
  const subscribedUsers = users
    .filter((user) => userIds.includes(user.id))
    .map((user) => ({ email: user.email! }));

  for (const user of subscribedUsers) {
    await emailFunction({ to: user.email, subject, emailProps });
  }
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

  // 2. Tentukan kondisi
  const tempLimit = THRESHOLDS.lingkungan.temp.max;
  const co2Limit = THRESHOLDS.lingkungan.co2.max;

  const isAlertTriggered = temp > tempLimit || co2_ppm > co2Limit;
  const currentFanStatus = fan_status;

  console.log(
    `[Alerting] Status saat ini: Alert=${isAlertTriggered}, Kipas=${currentFanStatus}`
  ); // <-- LOG 2

  const timestamp = format(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
    locale: localeID,
  });

  // 3. Terapkan Logika Kontrol
  if (isAlertTriggered && currentFanStatus === "Off") {
    // --- KONDISI: BARU SAJA PANAS, KIPAS MATI ---
    console.log(
      `[Alerting] PERINGATAN terpicu untuk ${device.name}. Menyalakan kipas...`
    ); // <-- LOG 3

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

    // a. Kirim Perintah 'On'
    await actuationService.controlFanRelay(deviceId, "On");

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
    await notifySubscribers("lingkungan", subject, emailProps, sendAlertEmail);
  } else if (!isAlertTriggered && currentFanStatus === "On") {
    // --- KONDISI: SUDAH DINGIN, KIPAS MASIH NYALA ---
    console.log(
      `[Alerting] NORMAL kembali untuk ${device.name}. Mematikan kipas...`
    ); // <-- LOG 4

    // a. Kirim Perintah 'Off'
    await actuationService.controlFanRelay(deviceId, "Off");

    // b. Kirim Notifikasi "Kembali Normal"
    const emailProps = {
      warehouseName: warehouse.name,
      areaName: area.name,
      deviceName: device.name,
      timestamp,
    };
    const subject = `[Info] Sistem Lingkungan di ${warehouse.name} Kembali Normal`;
    await notifySubscribers(
      "lingkungan",
      subject,
      emailProps,
      sendAllClearEmail
    );
  } else {
    // --- KONDISI STABIL ---
    // (Misal: Panas & kipas sudah nyala, ATAU Normal & kipas sudah mati)
    // Tidak melakukan apa-apa
    console.log("[Alerting] Kondisi stabil. Tidak ada aksi diperlukan."); // <-- LOG 5
  }
};
