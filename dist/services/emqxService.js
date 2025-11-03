"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deprovisionDeviceInEMQX = exports.provisionDeviceInEMQX = void 0;
// backend/src/services/emqxService.ts
const axios_1 = __importDefault(require("axios"));
require("dotenv/config");
const API_BASE_URL = process.env.EMQX_API_URL;
const AUTH = {
    username: process.env.EMQX_APP_ID,
    password: process.env.EMQX_APP_SECRET,
};
// Fungsi ini sudah benar (menggunakan user_id)
async function createMqttUser(deviceId) {
    const password = `pwd-${deviceId}-${Date.now()}`;
    const username = `device-${deviceId}`;
    const payload = {
        user_id: username,
        password: password,
        is_superuser: false,
    };
    await axios_1.default.post(`${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`, payload, { auth: AUTH });
    return { username, password };
}
// === PERBAIKAN UTAMA: Menggabungkan ACL dalam SATU PANGGILAN ===
async function setAclRules(userId, publishTopic, subscribeTopic) {
    // Buat payload yang berisi SEMUA aturan untuk pengguna ini
    const payload = [
        {
            user_id: userId,
            rules: [
                {
                    action: 'publish',
                    permission: 'allow',
                    topic: publishTopic,
                },
                {
                    action: 'subscribe',
                    permission: 'allow',
                    topic: subscribeTopic,
                }
            ],
        },
    ];
    await axios_1.default.post(
    // Endpoint ini akan MENETAPKAN (mengganti) semua aturan untuk user_id ini
    `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`, payload, { auth: AUTH });
}
// Fungsi utama yang memanggil logika baru
const provisionDeviceInEMQX = async (device) => {
    const { username, password } = await createMqttUser(device.id);
    const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
    const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    // Panggil fungsi setAclRules SATU KALI dengan kedua topik
    await setAclRules(username, deviceTopic, commandTopic);
    return { username, password };
};
exports.provisionDeviceInEMQX = provisionDeviceInEMQX;
// Fungsi untuk menghapus user MQTT di EMQX (tidak berubah)
const deprovisionDeviceInEMQX = async (deviceId) => {
    const username = `device-${deviceId}`;
    // Endpoint untuk delete menggunakan username di path, ini sudah benar
    const deleteUrl = `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`;
    try {
        await axios_1.default.delete(deleteUrl, { auth: AUTH });
    }
    catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn(`[EMQX Service] MQTT user ${username} not found for deletion. Skipping.`);
        }
        else {
            throw error;
        }
    }
};
exports.deprovisionDeviceInEMQX = deprovisionDeviceInEMQX;
