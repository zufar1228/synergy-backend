// backend/src/services/alertingService.ts
import { Device, Area, Warehouse } from "../db/models";
import { sendAlertEmail } from "./notificationService"; // <-- NAMA FILE DIPERBAIKI
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { DeviceAttributes } from "../db/models/device";
import { AreaAttributes } from "../db/models/area";
import { WarehouseAttributes } from "../db/models/warehouse";

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
  const subscribedUsers = [{ email: "zufarnatsir@apps.ipb.ac.id" }];

  for (const user of subscribedUsers) {
    await sendAlertEmail({ to: user.email, subject, emailProps });
  }
};
