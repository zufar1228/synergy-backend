import { sequelize } from "../config";
import Warehouse from "./warehouse";
import Area from "./area";
import Device from "./device";
import LingkunganLog from "./lingkunganLog";
import Incident from "./incident";
import Profile from "./profile";
import UserNotificationPreference from "./userNotificationPreference";
import KeamananLog from "./keamananLog"; // <-- IMPORT
import PushSubscription from "./pushSubscription";
import UserRole from "./userRole";
import TelegramSubscriber from "./telegramSubscriber";

// Definisikan Asosiasi
Warehouse.hasMany(Area, { foreignKey: "warehouse_id", as: "areas" });
Area.belongsTo(Warehouse, { foreignKey: "warehouse_id", as: "warehouse" });

Area.hasMany(Device, { foreignKey: "area_id", as: "devices" });
Device.belongsTo(Area, { foreignKey: "area_id", as: "area" });

Device.hasMany(LingkunganLog, {
  foreignKey: "device_id",
  as: "lingkunganLogs",
});
LingkunganLog.belongsTo(Device, { foreignKey: "device_id", as: "device" });

Device.hasMany(Incident, { foreignKey: "device_id", as: "incidents" });
Incident.belongsTo(Device, { foreignKey: "device_id", as: "device" });

Device.hasMany(KeamananLog, { foreignKey: "device_id", as: "keamananLogs" });
KeamananLog.belongsTo(Device, { foreignKey: "device_id", as: "device" });

Profile.hasMany(UserNotificationPreference, {
  foreignKey: "user_id",
  as: "notificationPreferences",
});
UserNotificationPreference.belongsTo(Profile, {
  foreignKey: "user_id",
  as: "profile",
});

Profile.hasMany(PushSubscription, {
  foreignKey: "user_id",
  as: "pushSubscriptions",
});
PushSubscription.belongsTo(Profile, {
  foreignKey: "user_id",
  as: "profile",
});

Profile.hasOne(UserRole, { foreignKey: 'user_id', as: 'userRole' });
UserRole.belongsTo(Profile, { foreignKey: 'user_id', as: 'profile' });

// Sinkronisasi database (opsional, bagus untuk development)
const syncDatabase = async () => {
  try {
    // Test database connection first
    await sequelize.authenticate();
    console.log("Database connection established successfully.");

    // Only sync in development, not in production
    if (process.env.NODE_ENV !== "production") {
      // await sequelize.sync({ alter: true }); // Jangan gunakan 'force: true' di production
      console.log("Database sync skipped in production.");
    }

    console.log("Database synchronized successfully.");
  } catch (error) {
    console.error("Unable to synchronize the database:", error);
    throw error; // Re-throw to be caught by the caller
  }
};

export {
  sequelize,
  syncDatabase,
  Warehouse,
  Area,
  Device,
  LingkunganLog,
  Profile,
  Incident,
  UserNotificationPreference,
  KeamananLog,
  PushSubscription,
  UserRole,
  TelegramSubscriber,
};
