// backend/src/services/emqxService.ts
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.EMQX_API_URL;

if (!process.env.EMQX_APP_ID || !process.env.EMQX_APP_SECRET) {
  throw new Error(
    "EMQX_APP_ID and EMQX_APP_SECRET must be defined in environment variables"
  );
}

const AUTH = {
  username: process.env.EMQX_APP_ID,
  password: process.env.EMQX_APP_SECRET,
};

// --- FUNGSI CREATE USER (Sudah benar) ---
async function createMqttUser(deviceId: string) {
  const password = `pwd-${deviceId}-${Date.now()}`;
  const username = `device-${deviceId}`; // Ini adalah 'user_id'

  const payload = {
    user_id: username,
    password: password,
    is_superuser: false,
  };

  try {
    await axios.post(
      `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`,
      payload,
      { auth: AUTH }
    );
    console.log(`[EMQX Service] User baru dibuat: ${username}`);
  } catch (error: any) {
    if (error.response && error.response.status === 409) {
      // 409 Conflict: User sudah ada. Ini seharusnya tidak terjadi setelah pembersihan,
      // tapi ini adalah pengaman jika terjadi.
      console.warn(`[EMQX Service] User ${username} sudah ada. Melanjutkan...`);
    } else {
      console.error("[EMQX Service] Gagal create user:", error.response?.data);
      throw error;
    }
  }

  return { username, password };
}

// --- FUNGSI PROVISIONING DENGAN PAYLOAD FLAT ARRAY YANG BENAR ---
export const provisionDeviceInEMQX = async (device: {
  id: string;
  area: { warehouse_id: string; id: string };
}) => {
  const { username, password } = await createMqttUser(device.id);

  const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
  const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;

  // Payload adalah array dari objek aturan, BUKAN objek yang di-nesting
  const aclPayload = [
    {
      user_id: username,
      action: "publish",
      permission: "allow",
      topic: deviceTopic,
    },
    {
      user_id: username,
      action: "subscribe",
      permission: "allow",
      topic: commandTopic,
    },
  ];

  try {
    // Kirim KEDUA aturan dalam SATU PANGGILAN API
    await axios.post(
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
      aclPayload,
      { auth: AUTH }
    );
    console.log(`[EMQX Service] ACL berhasil di-set untuk ${username}`);
  } catch (error: any) {
    console.error("[EMQX Service] Gagal set ACL:", error.response?.data);
    throw error;
  }

  return { username, password };
};

// --- FUNGSI DEPROVISIONING YANG DIPERBAIKI (INI YANG GAGAL SEBELUMNYA) ---
export const deprovisionDeviceInEMQX = async (deviceId: string) => {
  const username = `device-${deviceId}`; // Ini adalah 'user_id'

  // 1. Hapus aturan ACL
  try {
    // API ini menghapus SEMUA aturan untuk user_id tertentu
    await axios.delete(
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users/${username}`,
      { auth: AUTH }
    );
    console.log(`[EMQX Service] ACL berhasil dihapus untuk ${username}`);
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.warn(
        `[EMQX Service] Tidak ada ACL untuk ${username}. Melanjutkan...`
      );
    } else {
      console.error(
        `[EMQX Service] Gagal menghapus ACL:`,
        error.response?.data
      );
      // Jangan lemparkan error, lanjutkan ke penghapusan user
    }
  }

  // 2. Hapus pengguna
  try {
    const deleteUrl = `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`;
    await axios.delete(deleteUrl, { auth: AUTH });
    console.log(`[EMQX Service] User ${username} berhasil dihapus.`);
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.warn(
        `[EMQX Service] MQTT user ${username} not found for deletion. Skipping.`
      );
    } else {
      console.error(
        `[EMQX Service] Gagal menghapus user:`,
        error.response?.data
      );
      throw error;
    }
  }
};
