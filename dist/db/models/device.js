"use strict";
// backend/src/db/models/device.ts
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize"); // <-- IMPORT CreationOptional
const config_1 = require("../config");
class Device extends sequelize_1.Model {
}
Device.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.UUIDV4,
        primaryKey: true,
    },
    area_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    system_type: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    status: {
        type: sequelize_1.DataTypes.ENUM("Online", "Offline"),
        allowNull: false,
        defaultValue: "Offline",
    },
    last_heartbeat: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    fan_status: {
        // <-- TAMBAHKAN BLOK INI
        type: sequelize_1.DataTypes.ENUM("On", "Off"),
        allowNull: false,
        defaultValue: "Off",
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "devices",
    timestamps: true,
    underscored: true,
});
exports.default = Device;
