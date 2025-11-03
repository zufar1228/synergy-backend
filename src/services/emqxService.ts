// backend/src/services/emqxService.ts
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.EMQX_API_URL;
const AUTH = {
  username: process.env.EMQX_APP_ID || "",
  password: process.env.EMQX_APP_SECRET || "",
};

// Fungsi ini sudah benar
async function createMqttUser(deviceId: string) {
  const password = `pwd-${deviceId}-${Date.now()}`;
  const username = `device-${deviceId}`;

  const payload = {
    user_id: username,
    password: password,
    is_superuser: false,
  };

  await axios.post(
    `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`,
    payload,
    { auth: AUTH }
  );

  return { username, password };
}

// === PERBAIKAN TOTAL PADA FUNGSI PROVISIONING ===
export const provisionDeviceInEMQX = async (device: {
  id: string;
  area: { warehouse_id: string; id: string };
}) => {
  const { username, password } = await createMqttUser(device.id);

  const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
  const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;

  // Buat array payload yang berisi KEDUA aturan
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

  // Kirim KEDUA aturan dalam SATU PANGGILAN API
  await axios.post(
    `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
    aclPayload,
    { auth: AUTH }
  );

  return { username, password };
};

// Fungsi deprovisioning tidak berubah, tetapi kita akan membuatnya lebih tangguh
export const deprovisionDeviceInEMQX = async (deviceId: string) => {
  const username = `device-${deviceId}`;

  try {
    // 1. Hapus aturan ACL
    // Mengirim array kosong untuk user_id ini akan menghapus semua aturannya
    await axios.post(
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
      [{ user_id: username, rules: [] }],
      { auth: AUTH }
    );
  } catch (error: any) {
    console.warn(
      `[EMQX Service] Gagal membersihkan ACL untuk ${username}: ${error.message}`
    );
  }

  try {
    // 2. Hapus pengguna
    const deleteUrl = `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`;
    await axios.delete(deleteUrl, { auth: AUTH });
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.warn(
        `[EMQX Service] MQTT user ${username} not found for deletion. Skipping.`
      );
    } else {
      throw error;
    }
  }
};
