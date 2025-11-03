// backend/src/services/emqxService.ts
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.EMQX_API_URL;
const AUTH = {
  username: process.env.EMQX_APP_ID || "",
  password: process.env.EMQX_APP_SECRET || "",
};

// Fungsi ini sudah benar (menggunakan user_id)
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

// === PERBAIKAN DI SINI: Gunakan 'user_id' bukan 'username' ===
async function addAclRule(
  userId: string,
  action: "publish" | "subscribe",
  topic: string
) {
  const payload = [
    {
      // Kunci di sini harus 'user_id' agar cocok dengan 'createMqttUser'
      user_id: userId,
      rules: [
        {
          action: action,
          permission: "allow",
          topic: topic,
        },
      ],
    },
  ];

  await axios.post(
    `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
    payload,
    { auth: AUTH }
  );
}

// Fungsi utama (memanggil addAclRule 2x)
export const provisionDeviceInEMQX = async (device: {
  id: string;
  area: { warehouse_id: string; id: string };
}) => {
  const { username, password } = await createMqttUser(device.id);

  const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
  const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;

  // Kirim 'username' (yang merupakan 'user_id') ke fungsi ACL
  await addAclRule(username, "publish", deviceTopic);
  await addAclRule(username, "subscribe", commandTopic);

  return { username, password };
};

// Fungsi untuk menghapus user MQTT di EMQX (tidak berubah)
export const deprovisionDeviceInEMQX = async (deviceId: string) => {
  const username = `device-${deviceId}`;
  // Endpoint untuk delete menggunakan username di path, ini sudah benar
  const deleteUrl = `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`;
  try {
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
