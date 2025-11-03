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
exports.processSensorDataForAlerts = void 0;
// backend/src/services/alertingService.ts
const models_1 = require("../db/models");
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const notificationService_1 = require("./notificationService"); // <-- IMPORT BARU
const actuationService = __importStar(require("./actuationService")); // <-- IMPORT BARU
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
const THRESHOLDS = {
    lingkungan: {
        temp: { max: 40 }, // Suhu maks 40°C
        co2: { max: 1500 }, // CO2 maks 1500 ppm
    },
};
/**
 * Mengirim notifikasi (email) ke semua pengguna yang berlangganan
 */
const notifySubscribers = async (systemType, subject, emailProps, emailFunction) => {
    const userIds = (await models_1.UserNotificationPreference.findAll({
        where: { system_type: systemType, is_enabled: true },
        attributes: ["user_id"],
    })).map((sub) => sub.user_id);
    if (userIds.length === 0)
        return; // Tidak ada yang subscribe
    const { data: { users }, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
    const subscribedUsers = users
        .filter((user) => userIds.includes(user.id))
        .map((user) => ({ email: user.email }));
    for (const user of subscribedUsers) {
        await emailFunction({ to: user.email, subject, emailProps });
    }
};
/**
 * Memproses data sensor, membandingkan dengan ambang batas, dan mengontrol aktuator
 */
const processSensorDataForAlerts = async (deviceId, systemType, data) => {
    if (systemType !== "lingkungan")
        return;
    const { temp, co2_ppm } = data;
    console.log(`[Alerting] Menerima data untuk ${deviceId}: Temp=${temp}, CO2=${co2_ppm}`); // <-- LOG 1
    if (temp === undefined && co2_ppm === undefined) {
        console.log("[Alerting] Data tidak lengkap (temp/co2 tidak ada). Keluar.");
        return;
    }
    // 1. Dapatkan status perangkat saat ini (termasuk status kipas)
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [
            {
                model: models_1.Area,
                as: "area",
                include: [{ model: models_1.Warehouse, as: "warehouse" }],
            },
        ],
    }));
    if (!device) {
        console.error(`[Alerting] GAGAL: Perangkat dengan ID ${deviceId} tidak ditemukan.`);
        return;
    }
    if (!device.area || !device.area.warehouse) {
        console.error(`[Alerting] GAGAL: Relasi Area/Gudang untuk perangkat ${deviceId} tidak ditemukan.`);
        return;
    }
    const { area, fan_status } = device;
    const { warehouse } = area;
    // 2. Tentukan kondisi
    const tempLimit = THRESHOLDS.lingkungan.temp.max;
    const co2Limit = THRESHOLDS.lingkungan.co2.max;
    const isAlertTriggered = temp > tempLimit || co2_ppm > co2Limit;
    const currentFanStatus = fan_status;
    console.log(`[Alerting] Status saat ini: Alert=${isAlertTriggered}, Kipas=${currentFanStatus}`); // <-- LOG 2
    const timestamp = (0, date_fns_1.format)(new Date(), "dd MMMM yyyy, HH:mm:ss 'WIB'", {
        locale: locale_1.id,
    });
    // 3. Terapkan Logika Kontrol
    if (isAlertTriggered && currentFanStatus === "Off") {
        // --- KONDISI: BARU SAJA PANAS, KIPAS MATI ---
        console.log(`[Alerting] PERINGATAN terpicu untuk ${device.name}. Menyalakan kipas...`); // <-- LOG 3
        // Tentukan detail peringatan
        let incidentType = temp > tempLimit ? "Suhu Terlalu Tinggi" : "Kadar CO2 Tinggi";
        let details = temp > tempLimit
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
        await notifySubscribers("lingkungan", subject, emailProps, notificationService_1.sendAlertEmail);
    }
    else if (!isAlertTriggered && currentFanStatus === "On") {
        // --- KONDISI: SUDAH DINGIN, KIPAS MASIH NYALA ---
        console.log(`[Alerting] NORMAL kembali untuk ${device.name}. Mematikan kipas...`); // <-- LOG 4
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
        await notifySubscribers("lingkungan", subject, emailProps, notificationService_1.sendAllClearEmail);
    }
    else {
        // --- KONDISI STABIL ---
        // (Misal: Panas & kipas sudah nyala, ATAU Normal & kipas sudah mati)
        // Tidak melakukan apa-apa
        console.log("[Alerting] Kondisi stabil. Tidak ada aksi diperlukan."); // <-- LOG 5
    }
};
exports.processSensorDataForAlerts = processSensorDataForAlerts;
