import { sequelize } from "../config";
import Warehouse from "./warehouse";
import Area from "./area";
import Device from "./device";
import LingkunganLog from "./lingkunganLog";
import Incident from "./incident";
import Profile from "./profile";

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

// Sinkronisasi database (opsional, bagus untuk development)
const syncDatabase = async () => {
  try {
    // await sequelize.sync({ alter: true }); // Jangan gunakan 'force: true' di production
    console.log("Database synchronized successfully.");
  } catch (error) {
    console.error("Unable to synchronize the database:", error);
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
};
