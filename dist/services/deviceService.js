"use strict";
// backend/src/services/deviceService.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeviceHeartbeat = exports.getDeviceById = exports.deleteDevice = exports.updateDevice = exports.createDevice = exports.getAllDevices = void 0;
const models_1 = require("../db/models");
const config_1 = require("../db/config");
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
const emqxService = __importStar(require("./emqxService"));
// Ambil semua perangkat beserta relasi Area dan Gudang induknya
const getAllDevices = async () => {
    return await models_1.Device.findAll({
        include: [
            {
                model: models_1.Area,
                as: "area",
                attributes: ["id", "name"],
                include: [
                    {
                        model: models_1.Warehouse,
                        as: "warehouse",
                        attributes: ["id", "name"],
                    },
                ],
            },
        ],
        order: [["name", "ASC"]],
    });
};
exports.getAllDevices = getAllDevices;
// Fungsi createDevice sudah ada dari langkah sebelumnya, kita biarkan
const createDevice = async (deviceData) => {
    const transaction = await config_1.sequelize.transaction();
    try {
        const newDevice = await models_1.Device.create(deviceData, { transaction });
        let mqttCredentials = null; // Default kredensial adalah null
        // === PERUBAHAN DI SINI: Provisioning Bersyarat ===
        // Hanya jalankan provisioning MQTT jika BUKAN tipe keamanan
        if (deviceData.system_type !== "keamanan") {
            const deviceWithRelations = (await models_1.Device.findByPk(newDevice.id, {
                include: [{ model: models_1.Area, as: "area" }],
                transaction,
            }));
            if (!deviceWithRelations)
                throw new Error("Gagal mengambil relasi untuk perangkat baru");
            // Panggil service EMQX
            mqttCredentials = await emqxService.provisionDeviceInEMQX(deviceWithRelations);
        }
        // ===============================================
        await transaction.commit();
        // Kembalikan kredensial (bisa jadi null jika tipe 'keamanan')
        return { device: newDevice, mqttCredentials };
    }
    catch (error) {
        await transaction.rollback();
        // === PERBAIKAN UTAMA DI SINI ===
        // Cek nama error secara spesifik
        if (error.name === "SequelizeUniqueConstraintError") {
            throw new apiError_1.default(409, `Perangkat dengan tipe sistem '${deviceData.system_type}' sudah ada di area ini.`);
        }
        // =============================
        console.error("[Device Service] Failed to create device:", error);
        if (error instanceof apiError_1.default)
            throw error;
        if (error.isAxiosError) {
            throw new apiError_1.default(502, "Gagal membuat konfigurasi MQTT di provider.");
        }
        throw new apiError_1.default(500, "Gagal membuat perangkat karena kesalahan server.");
    }
};
exports.createDevice = createDevice;
// Fungsi baru untuk update
const updateDevice = async (id, data) => {
    const device = await models_1.Device.findByPk(id);
    if (!device)
        throw new apiError_1.default(404, "Perangkat tidak ditemukan");
    // Mencegah perubahan system_type setelah dibuat
    if (data.system_type && data.system_type !== device.system_type) {
        throw new apiError_1.default(400, "Tipe sistem (system_type) tidak dapat diubah setelah perangkat dibuat.");
    }
    try {
        await device.update(data);
        return device;
    }
    catch (error) {
        // PERBAIKAN: Gunakan UniqueConstraintError secara langsung
        if (error instanceof sequelize_1.UniqueConstraintError) {
            throw new apiError_1.default(409, `Perangkat dengan tipe sistem '${data.system_type}' sudah ada di area ini.`);
        }
        throw error;
    }
};
exports.updateDevice = updateDevice;
// Fungsi baru untuk delete
const deleteDevice = async (id) => {
    const device = await models_1.Device.findByPk(id);
    if (!device)
        throw new apiError_1.default(404, "Perangkat tidak ditemukan");
    // === PERUBAHAN DI SINI: De-provisioning Bersyarat ===
    // Hanya hapus user EMQX jika BUKAN tipe keamanan
    if (device.system_type !== "keamanan") {
        await emqxService.deprovisionDeviceInEMQX(id);
    }
    // =================================================
    // 2. Jika berhasil, baru hapus dari database kita
    await device.destroy();
};
exports.deleteDevice = deleteDevice;
// Fungsi baru untuk mengambil satu device by id
const getDeviceById = async (id) => {
    const device = await models_1.Device.findByPk(id, {
        include: [{ model: models_1.Area, as: "area" }], // Sertakan area untuk konteks
    });
    if (!device)
        throw new apiError_1.default(404, "Perangkat tidak ditemukan");
    return device;
};
exports.getDeviceById = getDeviceById;
// Fungsi updateHeartbeat tetap ada
const updateDeviceHeartbeat = async (deviceId) => {
    try {
        await models_1.Device.update({ status: "Online", last_heartbeat: new Date() }, { where: { id: deviceId } });
        console.log(`[Device Service] Heartbeat updated for device ${deviceId}`);
    }
    catch (error) {
        console.error(`[Device Service] Failed to update heartbeat for ${deviceId}:`, error);
    }
};
exports.updateDeviceHeartbeat = updateDeviceHeartbeat;
