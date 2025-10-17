// backend/src/services/alertingService.ts
import { Device, Area, Warehouse, UserNotificationPreference } from "../db/models";
import { sendAlertEmail } from "./notificationService"; // <-- NAMA FILE DIPERBAIKI
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { DeviceAttributes } from "../db/models/device";
import { AreaAttributes } from "../db/models/area";
import { WarehouseAttributes } from "../db/models/warehouse";
import { supabaseAdmin } from "../config/supabaseAdmin";
import ApiError from "../utils/apiError";

// Definisikan tipe untuk hasil query eager-loading
interface DeviceWithRelations extends Device {
  area: Area & {
    warehouse: Warehouse;
  };
}

const thresholds = {
  lingkungan: { temp: { max: 40 }, humidity: { max: 85 } },
};

export const processSensorDataForAlerts = async (
  deviceId: string,
  systemType: string,
  data: any
) => {
  if (systemType !== "lingkungan") return;
  const { temp } = data;
  let incidentType = "";
  const details = [];

  if (temp > thresholds.lingkungan.temp.max) {
    incidentType = "Suhu Terlalu Tinggi";
    details.push({ key: "Suhu Terdeteksi", value: `${temp}°C` });
    details.push({
      key: "Ambang Batas",
      value: `> ${thresholds.lingkungan.temp.max}°C`,
    });
  }

  if (!incidentType) return;

  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: "area",
        include: [{ model: Warehouse, as: "warehouse" }],
      },
    ],
  })) as DeviceWithRelations | null; // <-- GUNAKAN TYPE ASSERTION

  if (!device || !device.area || !device.area.warehouse) return;

  const { name: deviceName, area } = device;
  const { name: areaName, warehouse } = area;
  const { name: warehouseName } = warehouse;

  const emailProps = {
    incidentType,
    warehouseName,
    areaName,
    deviceName,
    timestamp: format(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
      locale: id,
    }),
    details,
  };

  const subject = `[PERINGATAN Kritis] Terdeteksi ${incidentType} di ${warehouseName} - ${areaName}`;

  // === PERBAIKAN: Ganti daftar user hardcoded dengan query dinamis ===
  // 1. Cari semua preferensi yang aktif untuk tipe sistem ini
  const activeSubscriptions = await UserNotificationPreference.findAll({
    where: {
      system_type: systemType,
      is_enabled: true,
    },
    attributes: ['user_id'],
  });

  if (activeSubscriptions.length === 0) {
    console.log(`[Alerting] No active subscribers for system type "${systemType}".`);
    return;
  }

  // 2. Ambil semua email dari user ID yang subscribe
  const userIds = activeSubscriptions.map(sub => sub.user_id);
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new ApiError(500, 'Gagal mengambil daftar pengguna untuk notifikasi.');

  const subscribedUsers = users
    .filter(user => userIds.includes(user.id))
    .map(user => ({ email: user.email! }));
  // =====================================================================

  for (const user of subscribedUsers) {
    await sendAlertEmail({ to: user.email, subject, emailProps });
  }
};
