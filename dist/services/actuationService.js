"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendIntrusiCommand = void 0;
// backend/src/services/actuationService.ts
const client_1 = require("../mqtt/client"); // <-- Impor client MQTT yang sudah diekspor
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
/**
 * Mengirim perintah ke perangkat intrusi (door security) via MQTT.
 * @param deviceId UUID perangkat
 * @param command Objek perintah sesuai spec v18
 */
const sendIntrusiCommand = async (deviceId, command) => {
    console.log(`[Actuation] 🔒 sendIntrusiCommand CALLED: deviceId=${deviceId}, cmd=${command.cmd}`);
    // 1. Ambil detail perangkat + relasi area
    const device = (await models_1.Device.findByPk(deviceId, {
        include: [{ model: models_1.Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
    }));
    if (!device) {
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan.');
    }
    if (device.system_type !== 'intrusi') {
        throw new apiError_1.default(400, 'Perintah ini hanya untuk perangkat intrusi (door security).');
    }
    // 2. Bangun topik MQTT
    const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    const payload = JSON.stringify(command);
    // 3. Publish perintah ke broker MQTT
    client_1.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
            console.error(`[Actuation] Gagal mengirim perintah intrusi ke ${topic}:`, err);
        }
        else {
            console.log(`[Actuation] Perintah intrusi '${payload}' terkirim ke ${topic}`);
        }
    });
};
exports.sendIntrusiCommand = sendIntrusiCommand;
