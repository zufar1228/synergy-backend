"use strict";
/**
 * @file actuationService.ts
 * @purpose Sends ARM/DISARM/SILENCE commands to intrusi devices via MQTT
 * @usedBy intrusiController
 * @deps mqtt/client, db/drizzle, schema (devices, areas), ApiError
 * @exports IntrusiCommand, sendIntrusiCommand
 * @sideEffects MQTT publish, DB read (device+area lookup)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendIntrusiCommand = void 0;
const client_1 = require("../../../mqtt/client");
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../../../utils/apiError"));
/**
 * Mengirim perintah ke perangkat intrusi (door security) via MQTT.
 */
const sendIntrusiCommand = async (deviceId, command) => {
    console.log(`[Actuation] sendIntrusiCommand CALLED: deviceId=${deviceId}, cmd=${command.cmd}`);
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId),
        with: { area: { columns: { id: true, warehouse_id: true } } }
    });
    if (!device) {
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan.');
    }
    if (device.system_type !== 'intrusi') {
        throw new apiError_1.default(400, 'Perintah ini hanya untuk perangkat intrusi (door security).');
    }
    const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    const payload = JSON.stringify(command);
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
