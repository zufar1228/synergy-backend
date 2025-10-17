"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSensorDataForAlerts = void 0;
// backend/src/services/alertingService.ts
const models_1 = require("../db/models");
const notificationService_1 = require("./notificationService"); // <-- NAMA FILE DIPERBAIKI
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const apiError_1 = __importDefault(require("../utils/apiError"));
const thresholds = {
    lingkungan: { temp: { max: 40 }, humidity: { max: 85 } },
};
const processSensorDataForAlerts = async (deviceId, systemType, data) => {
    if (systemType !== "lingkungan")
        return;
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
    if (!incidentType)
        return;
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: "area",
                include: [{ model: models_1.Warehouse, as: "warehouse" }],
            },
        ],
    })); // <-- GUNAKAN TYPE ASSERTION
    if (!device || !device.area || !device.area.warehouse)
        return;
    const { name: deviceName, area } = device;
    const { name: areaName, warehouse } = area;
    const { name: warehouseName } = warehouse;
    const emailProps = {
        incidentType,
        warehouseName,
        areaName,
        deviceName,
        timestamp: (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
            locale: locale_1.id,
        }),
        details,
    };
    const subject = `[PERINGATAN Kritis] Terdeteksi ${incidentType} di ${warehouseName} - ${areaName}`;
    // === PERBAIKAN: Ganti daftar user hardcoded dengan query dinamis ===
    // 1. Cari semua preferensi yang aktif untuk tipe sistem ini
    const activeSubscriptions = await models_1.UserNotificationPreference.findAll({
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
    const { data: { users }, error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
    if (error)
        throw new apiError_1.default(500, 'Gagal mengambil daftar pengguna untuk notifikasi.');
    const subscribedUsers = users
        .filter(user => userIds.includes(user.id))
        .map(user => ({ email: user.email }));
    // =====================================================================
    for (const user of subscribedUsers) {
        await (0, notificationService_1.sendAlertEmail)({ to: user.email, subject, emailProps });
    }
};
exports.processSensorDataForAlerts = processSensorDataForAlerts;
