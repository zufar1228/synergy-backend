"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSensorDataForAlerts = void 0;
// backend/src/services/alertingService.ts
const models_1 = require("../db/models");
const notificationService_1 = require("./notificationService"); // <-- NAMA FILE DIPERBAIKI
const date_fns_1 = require("date-fns");
const locale_1 = require("date-fns/locale");
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
    const subscribedUsers = [{ email: "zufarnatsir@apps.ipb.ac.id" }];
    for (const user of subscribedUsers) {
        await (0, notificationService_1.sendAlertEmail)({ to: user.email, subject, emailProps });
    }
};
exports.processSensorDataForAlerts = processSensorDataForAlerts;
