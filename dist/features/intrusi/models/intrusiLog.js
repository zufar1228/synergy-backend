"use strict";
/**
 * @file intrusiLog.ts
 * @purpose Legacy Sequelize model + type definitions for intrusi event logs
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports IntrusiEventType, DoorState, SystemState, AcknowledgeStatus, IntrusiLogAttributes, IntrusiLogCreationAttributes, IntrusiLog (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../../../db/config");
class IntrusiLog extends sequelize_1.Model {
}
IntrusiLog.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    timestamp: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    event_type: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    system_state: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    door_state: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    peak_delta_g: { type: sequelize_1.DataTypes.REAL, allowNull: true },
    hit_count: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
    payload: { type: sequelize_1.DataTypes.JSONB, allowNull: true },
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
    tableName: 'intrusi_logs',
    timestamps: false,
    underscored: true
});
exports.default = IntrusiLog;
