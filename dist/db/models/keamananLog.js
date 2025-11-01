"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/keamananLog.ts
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class KeamananLog extends sequelize_1.Model {
}
KeamananLog.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    created_at: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    image_url: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    detected: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    box: { type: sequelize_1.DataTypes.JSONB, allowNull: true },
    confidence: { type: sequelize_1.DataTypes.REAL, allowNull: true },
    attributes: { type: sequelize_1.DataTypes.JSONB, allowNull: true },
    status: {
        type: sequelize_1.DataTypes.ENUM("unacknowledged", "acknowledged", "resolved", "false_alarm"),
        defaultValue: "unacknowledged",
        allowNull: false,
    },
    acknowledged_by: { type: sequelize_1.DataTypes.UUID, allowNull: true },
    acknowledged_at: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    notification_sent_at: { type: sequelize_1.DataTypes.DATE, allowNull: true }, // <-- TAMBAHKAN INI
}, {
    sequelize: config_1.sequelize,
    tableName: "keamanan_logs",
    timestamps: false,
    underscored: true,
});
exports.default = KeamananLog;
