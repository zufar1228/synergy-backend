"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCalibrationCommand = void 0;
const client_1 = require("../../../mqtt/client");
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Send a calibration command to a device via MQTT
 */
const sendCalibrationCommand = async (deviceId, command) => {
    console.log(`[Calibration] sendCalibrationCommand: deviceId=${deviceId}, cmd=${command.cmd}`);
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId),
        with: { area: { columns: { id: true, warehouse_id: true } } }
    });
    if (!device) {
        throw new Error('Device not found');
    }
    const topic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    const payload = JSON.stringify(command);
    return new Promise((resolve, reject) => {
        client_1.client.publish(topic, payload, { qos: 1 }, (err) => {
            if (err) {
                console.error(`[Calibration] Failed to publish to ${topic}:`, err);
                reject(err);
            }
            else {
                console.log(`[Calibration] Command '${command.cmd}' sent to ${topic}`);
                resolve();
            }
        });
    });
};
exports.sendCalibrationCommand = sendCalibrationCommand;
