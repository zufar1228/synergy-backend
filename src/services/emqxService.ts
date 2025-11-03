// backend/src/services/emqxService.ts
import axios from "axios";
import "dotenv/config";

const API_BASE_URL = process.env.EMQX_API_URL;
if (!process.env.EMQX_APP_ID || !process.env.EMQX_APP_SECRET) {
  throw new Error(
    "EMQX_APP_ID and EMQX_APP_SECRET must be set in environment variables"
  );
}
const AUTH = {
  username: process.env.EMQX_APP_ID as string,
  password: process.env.EMQX_APP_SECRET as string,
};

console.log("\n" + "=".repeat(80));
console.log("🔧 EMQX SERVICE MODULE LOADED");
console.log("=".repeat(80));
console.log("📡 EMQX API URL:", API_BASE_URL);
console.log("👤 EMQX APP ID:", AUTH.username);
console.log("🔑 EMQX APP SECRET:", AUTH.password?.substring(0, 20) + "...");
console.log("=".repeat(80) + "\n");

async function createMqttUser(deviceId: string) {
  const password = `pwd-${deviceId}-${Date.now()}`;
  const username = `device-${deviceId}`;

  const payload = {
    user_id: username,
    password: password,
    is_superuser: false,
  };

  console.log("🔵 [EMQX] Creating MQTT user:", username);

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users`,
      payload,
      { auth: AUTH }
    );
    console.log("✅ [EMQX] MQTT user created successfully");
    console.log("   Response status:", response.status);
    console.log("   Response data:", JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error("❌ [EMQX] Error creating MQTT user");
    console.error("   Status:", error.response?.status);
    console.error("   Status Text:", error.response?.statusText);
    console.error(
      "   Error Data:",
      JSON.stringify(error.response?.data, null, 2)
    );
    console.error("   Error Message:", error.message);
    throw error;
  }

  return { username, password };
}

async function setAclRules(
  userId: string,
  publishTopic: string,
  subscribeTopic: string
) {
  // Buat payload yang berisi SEMUA aturan untuk pengguna ini
  const payload = [
    {
      username: userId, // ⚠️ PERHATIKAN: Mungkin harus "username" bukan "user_id"
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

  console.log("🔵 [EMQX] Setting ACL rules");
  console.log("   User ID:", userId);
  console.log("   Publish Topic:", publishTopic);
  console.log("   Subscribe Topic:", subscribeTopic);
  console.log("   Payload:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`,
      payload,
      {
        auth: AUTH,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log("✅ [EMQX] ACL rules set successfully");
    console.log("   Response status:", response.status);
    console.log("   Response data:", JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error("❌ [EMQX] Error setting ACL rules");
    console.error(
      "   URL:",
      `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users`
    );
    console.error("   Status:", error.response?.status);
    console.error("   Status Text:", error.response?.statusText);
    console.error(
      "   Error Data:",
      JSON.stringify(error.response?.data, null, 2)
    );
    console.error("   Error Message:", error.message);
    console.error("   Request Payload:", JSON.stringify(payload, null, 2));
    throw error;
  }
}

export const provisionDeviceInEMQX = async (device: {
  id: string;
  area: { warehouse_id: string; id: string };
}) => {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 [EMQX] Starting device provisioning");
  console.log("=".repeat(80));
  console.log("   Device ID:", device.id);
  console.log("   Area ID:", device.area?.id);
  console.log("   Warehouse ID:", device.area?.warehouse_id);

  // Validasi area
  if (!device.area) {
    console.error("❌ [EMQX] Device area is missing!");
    throw new Error("Device must have area relation loaded");
  }

  if (!device.area.warehouse_id) {
    console.error("❌ [EMQX] Warehouse ID is missing from area!");
    throw new Error("Area must have warehouse_id");
  }

  try {
    const { username, password } = await createMqttUser(device.id);

    const deviceTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/#`;
    const commandTopic = `warehouses/${device.area.warehouse_id}/areas/${device.area.id}/devices/${device.id}/commands`;

    console.log("📍 [EMQX] Generated topics:");
    console.log("   Device Topic (publish):", deviceTopic);
    console.log("   Command Topic (subscribe):", commandTopic);

    // Panggil fungsi setAclRules SATU KALI dengan kedua topik
    await setAclRules(username, deviceTopic, commandTopic);

    console.log("✅ [EMQX] Device provisioning completed successfully");
    console.log("=".repeat(80) + "\n");

    return { username, password };
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ [EMQX] Device provisioning FAILED");
    console.error("=".repeat(80));
    console.error("   Device ID:", device.id);
    console.error("   Error:", error.message);
    console.error("=".repeat(80) + "\n");
    throw error;
  }
};

export const deprovisionDeviceInEMQX = async (deviceId: string) => {
  const username = `device-${deviceId}`;

  console.log("\n" + "=".repeat(80));
  console.log("🗑️  [EMQX] Starting device deprovisioning");
  console.log("=".repeat(80));
  console.log("   Device ID:", deviceId);
  console.log("   Username:", username);

  try {
    // 1. Hapus ACL rules terlebih dahulu
    console.log("🔵 [EMQX] Step 1: Deleting ACL rules...");
    try {
      await axios.delete(
        `${API_BASE_URL}/api/v5/authorization/sources/built_in_database/rules/users/${username}`,
        { auth: AUTH }
      );
      console.log("✅ [EMQX] ACL rules deleted successfully");
    } catch (aclError: any) {
      // Jika ACL rules tidak ditemukan, itu OK (mungkin sudah dihapus)
      if (aclError.response?.status === 404) {
        console.log(
          "⚠️  [EMQX] ACL rules not found (already deleted or never existed)"
        );
      } else {
        console.error("❌ [EMQX] Error deleting ACL rules:");
        console.error("   Status:", aclError.response?.status);
        console.error("   Status Text:", aclError.response?.statusText);
        console.error(
          "   Error Data:",
          JSON.stringify(aclError.response?.data, null, 2)
        );
        throw aclError; // Re-throw jika error bukan 404
      }
    }

    // 2. Hapus user MQTT
    console.log("🔵 [EMQX] Step 2: Deleting MQTT user...");
    const deleteUserUrl = `${API_BASE_URL}/api/v5/authentication/password_based%3Abuilt_in_database/users/${username}`;
    console.log("   URL:", deleteUserUrl);

    const response = await axios.delete(deleteUserUrl, { auth: AUTH });

    console.log("✅ [EMQX] MQTT user deleted successfully");
    console.log("   Response status:", response.status);
    console.log("   Response data:", JSON.stringify(response.data, null, 2));
    console.log("=".repeat(80) + "\n");
  } catch (error: any) {
    console.error("\n" + "=".repeat(80));
    console.error("❌ [EMQX] Device deprovisioning FAILED");
    console.error("=".repeat(80));
    console.error("   Device ID:", deviceId);
    console.error("   Username:", username);
    console.error("   Error Type:", error.name);
    console.error("   Error Message:", error.message);

    if (error.response) {
      console.error("   HTTP Status:", error.response.status);
      console.error("   Status Text:", error.response.statusText);
      console.error(
        "   Response Data:",
        JSON.stringify(error.response.data, null, 2)
      );
      console.error("   Request URL:", error.config?.url);
    }

    console.error("=".repeat(80) + "\n");

    // Jangan throw error - biarkan penghapusan device tetap berlanjut
    // Tapi log error dengan jelas untuk debugging
    console.error(
      "⚠️  [EMQX] Deprovisioning failed but continuing with device deletion..."
    );
  }
};
