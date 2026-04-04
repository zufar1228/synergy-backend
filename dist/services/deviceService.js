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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDeviceHeartbeat = exports.getDeviceByAreaAndSystem = exports.getDeviceById = exports.deleteDevice = exports.updateDevice = exports.createDevice = exports.getAllDevices = void 0;
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../utils/apiError"));
const emqxService = __importStar(require("./emqxService"));
const getAllDevices = async () => {
    return await drizzle_1.db.query.devices.findMany({
        with: {
            area: {
                columns: { id: true, name: true },
                with: { warehouse: { columns: { id: true, name: true } } }
            }
        },
        orderBy: [(0, drizzle_orm_1.asc)(schema_1.devices.name)]
    });
};
exports.getAllDevices = getAllDevices;
const createDevice = async (deviceData) => {
    try {
        return await drizzle_1.db.transaction(async (tx) => {
            const [newDevice] = await tx
                .insert(schema_1.devices)
                .values(deviceData)
                .returning();
            let mqttCredentials = null;
            if (deviceData.system_type !== 'keamanan') {
                const deviceWithRelations = await tx.query.devices.findFirst({
                    where: (0, drizzle_orm_1.eq)(schema_1.devices.id, newDevice.id),
                    with: { area: true }
                });
                if (!deviceWithRelations)
                    throw new Error('Gagal mengambil relasi untuk perangkat baru');
                mqttCredentials = await emqxService.provisionDeviceInEMQX(deviceWithRelations);
            }
            return { device: newDevice, mqttCredentials };
        });
    }
    catch (error) {
        // PostgreSQL unique violation
        if (error.code === '23505') {
            throw new apiError_1.default(409, `Perangkat dengan tipe sistem '${deviceData.system_type}' sudah ada di area ini.`);
        }
        console.error('[Device Service] Failed to create device:', error);
        if (error instanceof apiError_1.default)
            throw error;
        if (error.isAxiosError) {
            throw new apiError_1.default(502, 'Gagal membuat konfigurasi MQTT di provider.');
        }
        throw new apiError_1.default(500, 'Gagal membuat perangkat karena kesalahan server.');
    }
};
exports.createDevice = createDevice;
const updateDevice = async (id, data) => {
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, id)
    });
    if (!device)
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan');
    if (data.system_type && data.system_type !== device.system_type) {
        throw new apiError_1.default(400, 'Tipe sistem (system_type) tidak dapat diubah setelah perangkat dibuat.');
    }
    try {
        const [updated] = await drizzle_1.db
            .update(schema_1.devices)
            .set({ ...data, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.devices.id, id))
            .returning();
        return updated;
    }
    catch (error) {
        if (error.code === '23505') {
            throw new apiError_1.default(409, `Perangkat dengan tipe sistem '${data.system_type}' sudah ada di area ini.`);
        }
        throw error;
    }
};
exports.updateDevice = updateDevice;
const deleteDevice = async (id) => {
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, id)
    });
    if (!device)
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan');
    if (device.system_type !== 'keamanan') {
        await emqxService.deprovisionDeviceInEMQX(id);
    }
    await drizzle_1.db.delete(schema_1.devices).where((0, drizzle_orm_1.eq)(schema_1.devices.id, id));
};
exports.deleteDevice = deleteDevice;
const getDeviceById = async (id) => {
    const device = await drizzle_1.db.query.devices.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.devices.id, id),
        with: { area: true }
    });
    if (!device)
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan');
    return device;
};
exports.getDeviceById = getDeviceById;
const getDeviceByAreaAndSystem = async (areaId, systemType) => {
    const result = await drizzle_1.db
        .select({
        id: schema_1.devices.id,
        name: schema_1.devices.name,
        status: schema_1.devices.status,
        fan_state: schema_1.devices.fan_state,
        door_state: schema_1.devices.door_state,
        intrusi_system_state: schema_1.devices.intrusi_system_state,
        siren_state: schema_1.devices.siren_state,
        power_source: schema_1.devices.power_source,
        vbat_voltage: schema_1.devices.vbat_voltage,
        vbat_pct: schema_1.devices.vbat_pct
    })
        .from(schema_1.devices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.devices.area_id, areaId), (0, drizzle_orm_1.eq)(schema_1.devices.system_type, systemType)))
        .limit(1);
    if (result.length === 0) {
        throw new apiError_1.default(404, 'Perangkat tidak ditemukan untuk area dan tipe sistem ini.');
    }
    return result[0];
};
exports.getDeviceByAreaAndSystem = getDeviceByAreaAndSystem;
const updateDeviceHeartbeat = async (deviceId, extraFields) => {
    try {
        const updateData = {
            status: 'Online',
            last_heartbeat: new Date()
        };
        if (extraFields) {
            for (const [key, value] of Object.entries(extraFields)) {
                if (value !== undefined && value !== null) {
                    updateData[key] = value;
                }
            }
        }
        await drizzle_1.db.update(schema_1.devices).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.devices.id, deviceId));
        console.log(`[Device Service] Heartbeat updated for device ${deviceId}`);
    }
    catch (error) {
        console.error(`[Device Service] Failed to update heartbeat for ${deviceId}:`, error);
    }
};
exports.updateDeviceHeartbeat = updateDeviceHeartbeat;
