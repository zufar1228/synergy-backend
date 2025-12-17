"use strict";
// backend/src/db/models/proteksiAsetLog.ts
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
// Model class
class ProteksiAsetLog extends sequelize_1.Model {
}
ProteksiAsetLog.init({
    id: {
        type: sequelize_1.DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
    },
    device_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    incident_type: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false,
        validate: {
            isIn: [["IMPACT", "VIBRATION", "THERMAL", "WATER_LEAK", "NORMAL"]],
        },
    },
    confidence: {
        type: sequelize_1.DataTypes.FLOAT,
        allowNull: true,
    },
    data: {
        type: sequelize_1.DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    is_cleared: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    timestamp: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "proteksi_aset_logs",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
});
exports.default = ProteksiAsetLog;
