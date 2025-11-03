"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.controlFanRelay = void 0;
// backend/src/services/actuationService.ts
const client_1 = require("../mqtt/client"); // <-- Impor client MQTT yang sudah diekspor
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
/**
 * Mengirim perintah On/Off ke perangkat dan memperbarui status di database.
 * @param deviceId UUID perangkat yang dituju
 * @param state Status baru ('On' atau 'Off')
 */
const controlFanRelay = async (deviceId, state) => {
    // 1. Ambil detail perangkat (termasuk relasinya) untuk membangun topik
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [{ model: models_1.Area, as: "area", attributes: ["id", "warehouse_id"] }],
    }));
    if (!device) {
        throw new apiError_1.default(404, "Perangkat tidak ditemukan.");
    }
    if (device.system_type !== "lingkungan") {
        throw new apiError_1.default(400, "Perintah ini hanya untuk perangkat lingkungan.");
    }
    // 2. Cegah pengiriman perintah yang tidak perlu
    if (device.fan_status === state) {
        console.log(`[Actuation] Kipas untuk ${deviceId} sudah dalam status '${state}'. Perintah diabaikan.`);
        return;
    }
    // 3. Bangun topik dan payload
    const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    const payload = JSON.stringify({ relay: state });
    // 4. Kirim (publish) perintah ke broker MQTT
    client_1.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error(`[Actuation] Gagal mengirim perintah ke ${topic}:`, err);
        }
        else {
            console.log(`[Actuation] Perintah '${payload}' terkirim ke ${topic}`);
        }
    });
    // 5. Update status di database kita agar sinkron
    await device.update({ fan_status: state });
    console.log(`[DB] Status kipas untuk ${deviceId} diperbarui menjadi '${state}'.`);
};
exports.controlFanRelay = controlFanRelay;
