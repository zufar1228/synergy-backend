// backend/src/services/emqxService.ts
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.EMQX_API_URL;
const AUTH = {
  username: process.env.EMQX_APP_ID || "",
  password: process.env.EMQX_APP_SECRET || "",
};

async function createMqttUser(deviceId: string) {
  const password = `pwd-${deviceId}-${Date.now()}`;
  const username = `device-${deviceId}`;

  const payload = {
    user_id: username,
    password: password,
    is_superuser: false,
  };

  console.log("🔵 Creating MQTT user:", username);

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`,
      payload,
      { auth: AUTH }
    );
    console.log("✅ MQTT user created successfully");
  } catch (error: any) {
    console.error(
      "❌ Error creating MQTT user:",
      error.response?.data || error.message
    );
    throw error;
  }

  return { username, password };
}

async function setAclRules(
  userId: string,
  publishTopic: string,
  subscribeTopic: string
) {
  const payload = [
    {
      user_id: userId,
      rules: [
        {
          action: "publish",
          permission: "allow",
          topic: publishTopic,
        },
        {
          action: "subscribe",
          permission: "allow",
          topic: subscribeTopic,
        },
      ],
    },
  ];

  console.log("🔵 Setting ACL rules for:", userId);
  console.log("📝 Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
      payload,
      { auth: AUTH }
    );
    console.log("✅ ACL rules set successfully");
    console.log("📊 Response:", response.data);
  } catch (error: any) {
    console.error(
      "❌ Error setting ACL rules:",
      error.response?.data || error.message
    );
    throw error;
  }
}

export const provisionDeviceInEMQX = async (device: {
  id: string;
  area: { warehouse_id: string; id: string };
}) => {
  console.log("🚀 Starting device provisioning for device:", device.id);

  const { username, password } = await createMqttUser(device.id);

  const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
  const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;

  console.log("📍 Device topic (publish):", deviceTopic);
  console.log("📍 Command topic (subscribe):", commandTopic);

  await setAclRules(username, deviceTopic, commandTopic);

  console.log("✅ Device provisioning completed");

  return { username, password };
};

export const deprovisionDeviceInEMQX = async (deviceId: string) => {
  const username = `device-${deviceId}`;

  console.log("🗑️ Deprovisioning device:", username);

  try {
    await axios.delete(
      `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`,
      { auth: AUTH }
    );
    console.log("✅ Device deprovisioned successfully");
  } catch (error: any) {
    console.error(
      "❌ Error deprovisioning device:",
      error.response?.data || error.message
    );
  }
};
