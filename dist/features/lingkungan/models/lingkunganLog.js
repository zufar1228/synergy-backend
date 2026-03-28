"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/lingkunganLog.ts
const sequelize_1 = require("sequelize");
const config_1 = require("../../../db/config");
class LingkunganLog extends sequelize_1.Model {
}
LingkunganLog.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    timestamp: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    temperature: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    humidity: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    co2: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    status: {
        type: sequelize_1.DataTypes.ENUM('unacknowledged', 'acknowledged', 'resolved', 'false_alarm'),
        defaultValue: 'unacknowledged',
        allowNull: false
    },
    acknowledged_by: { type: sequelize_1.DataTypes.UUID, allowNull: true },
    acknowledged_at: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    notification_sent_at: { type: sequelize_1.DataTypes.DATE, allowNull: true }
}, {
    sequelize: config_1.sequelize,
    tableName: 'lingkungan_logs',
    timestamps: false,
    underscored: true
});
exports.default = LingkunganLog;
