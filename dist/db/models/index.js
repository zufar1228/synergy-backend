"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProteksiAsetLog = exports.IntrusiLog = exports.TelegramSubscriber = exports.UserRole = exports.PushSubscription = exports.KeamananLog = exports.UserNotificationPreference = exports.Incident = exports.Profile = exports.LingkunganLog = exports.Device = exports.Area = exports.Warehouse = exports.syncDatabase = exports.sequelize = void 0;
const config_1 = require("../config");
Object.defineProperty(exports, "sequelize", { enumerable: true, get: function () { return config_1.sequelize; } });
const warehouse_1 = __importDefault(require("./warehouse"));
exports.Warehouse = warehouse_1.default;
const area_1 = __importDefault(require("./area"));
exports.Area = area_1.default;
const device_1 = __importDefault(require("./device"));
exports.Device = device_1.default;
const lingkunganLog_1 = __importDefault(require("./lingkunganLog"));
exports.LingkunganLog = lingkunganLog_1.default;
const incident_1 = __importDefault(require("./incident"));
exports.Incident = incident_1.default;
const profile_1 = __importDefault(require("./profile"));
exports.Profile = profile_1.default;
const userNotificationPreference_1 = __importDefault(require("./userNotificationPreference"));
exports.UserNotificationPreference = userNotificationPreference_1.default;
const keamananLog_1 = __importDefault(require("./keamananLog")); // <-- IMPORT
exports.KeamananLog = keamananLog_1.default;
const pushSubscription_1 = __importDefault(require("./pushSubscription"));
exports.PushSubscription = pushSubscription_1.default;
const userRole_1 = __importDefault(require("./userRole"));
exports.UserRole = userRole_1.default;
const telegramSubscriber_1 = __importDefault(require("./telegramSubscriber"));
exports.TelegramSubscriber = telegramSubscriber_1.default;
const intrusiLog_1 = __importDefault(require("./intrusiLog")); // <-- IMPORT (TinyML Intrusion Detection)
exports.IntrusiLog = intrusiLog_1.default;
const proteksiAsetLog_1 = __importDefault(require("./proteksiAsetLog")); // <-- IMPORT (Proteksi Aset)
exports.ProteksiAsetLog = proteksiAsetLog_1.default;
// Definisikan Asosiasi
warehouse_1.default.hasMany(area_1.default, { foreignKey: "warehouse_id", as: "areas" });
area_1.default.belongsTo(warehouse_1.default, { foreignKey: "warehouse_id", as: "warehouse" });
area_1.default.hasMany(device_1.default, { foreignKey: "area_id", as: "devices" });
device_1.default.belongsTo(area_1.default, { foreignKey: "area_id", as: "area" });
device_1.default.hasMany(lingkunganLog_1.default, {
    foreignKey: "device_id",
    as: "lingkunganLogs",
});
lingkunganLog_1.default.belongsTo(device_1.default, { foreignKey: "device_id", as: "device" });
device_1.default.hasMany(incident_1.default, { foreignKey: "device_id", as: "incidents" });
incident_1.default.belongsTo(device_1.default, { foreignKey: "device_id", as: "device" });
device_1.default.hasMany(keamananLog_1.default, { foreignKey: "device_id", as: "keamananLogs" });
keamananLog_1.default.belongsTo(device_1.default, { foreignKey: "device_id", as: "device" });
// Relasi IntrusiLog (TinyML Intrusion Detection)
device_1.default.hasMany(intrusiLog_1.default, { foreignKey: "device_id", as: "intrusiLogs" });
intrusiLog_1.default.belongsTo(device_1.default, { foreignKey: "device_id", as: "device" });
// Relasi ProteksiAsetLog (Proteksi Aset ML Detection)
device_1.default.hasMany(proteksiAsetLog_1.default, { foreignKey: "device_id", as: "proteksiAsetLogs" });
proteksiAsetLog_1.default.belongsTo(device_1.default, { foreignKey: "device_id", as: "device" });
profile_1.default.hasMany(userNotificationPreference_1.default, {
    foreignKey: "user_id",
    as: "notificationPreferences",
});
userNotificationPreference_1.default.belongsTo(profile_1.default, {
    foreignKey: "user_id",
    as: "profile",
});
profile_1.default.hasMany(pushSubscription_1.default, {
    foreignKey: "user_id",
    as: "pushSubscriptions",
});
pushSubscription_1.default.belongsTo(profile_1.default, {
    foreignKey: "user_id",
    as: "profile",
});
profile_1.default.hasOne(userRole_1.default, { foreignKey: 'user_id', as: 'userRole' });
userRole_1.default.belongsTo(profile_1.default, { foreignKey: 'user_id', as: 'profile' });
// Sinkronisasi database (opsional, bagus untuk development)
const syncDatabase = async () => {
    try {
        // Test database connection first
        await config_1.sequelize.authenticate();
        console.log("Database connection established successfully.");
        // Only sync in development, not in production
        if (process.env.NODE_ENV !== "production") {
            // await sequelize.sync({ alter: true }); // Jangan gunakan 'force: true' di production
            console.log("Database sync skipped in production.");
        }
        console.log("Database synchronized successfully.");
    }
    catch (error) {
        console.error("Unable to synchronize the database:", error);
        throw error; // Re-throw to be caught by the caller
    }
};
exports.syncDatabase = syncDatabase;
