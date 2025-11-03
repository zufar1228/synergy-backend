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
// Fungsi untuk membuat user MQTT baru di EMQX
async function createMqttUser(deviceId) {
    const password = `pwd-${deviceId}-${Date.now()}`;
    const username = `device-${deviceId}`;
    // === PERBAIKAN DI SINI ===
    // Ganti payload dari { username, password } menjadi { user_id, password, is_superuser }
    const payload = {
        user_id: username, // API EMQX mengharapkan 'user_id'
        password: password,
        is_superuser: false, // Set ke false sesuai praktik keamanan
    };
    await axios_1.default.post(`${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`, payload, // Gunakan payload yang sudah diperbaiki
    { auth: AUTH });
    return { username, password };
}
// === PERBAIKAN UTAMA ADA DI FUNGSI INI ===
// Kita ubah menjadi 'addAclRule' (singular) dan hanya menangani satu aturan
async function addAclRule(username, action, topic) {
    const payload = [
        {
            username: username,
            rules: [
                {
                    action: action,
                    permission: 'allow',
                    topic: topic,
                },
            ],
        },
    ];
    await axios_1.default.post(`${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`, payload, { auth: AUTH });
}
// Fungsi utama yang dipanggil (diperbarui untuk memanggil ACL dua kali)
const provisionDeviceInEMQX = async (device) => {
    const { username, password } = await createMqttUser(device.id);
    // Definisikan kedua topik
    const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
    const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;
    // Panggil fungsi 'addAclRule' DUA KALI
    // 1. Tambahkan izin PUBLISH
    await addAclRule(username, 'publish', deviceTopic);
    // 2. Tambahkan izin SUBSCRIBE
    await addAclRule(username, 'subscribe', commandTopic);
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
