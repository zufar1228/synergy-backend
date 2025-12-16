"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/intrusiLog.ts
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class IntrusiLog extends sequelize_1.Model {
}
IntrusiLog.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    event_class: {
        type: sequelize_1.DataTypes.ENUM("Normal", "Disturbance", "Intrusion"),
        allowNull: false,
    },
    confidence: { type: sequelize_1.DataTypes.DECIMAL(5, 4), allowNull: false },
    payload: { type: sequelize_1.DataTypes.JSONB, allowNull: true },
    timestamp: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
}, {
    sequelize: config_1.sequelize,
    tableName: "intrusi_logs",
    timestamps: false, // Kita pakai timestamp manual dari device/default
    underscored: true,
});
exports.default = IntrusiLog;
