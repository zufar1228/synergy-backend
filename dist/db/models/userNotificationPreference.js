"use strict";
/**
 * @file userNotificationPreference.ts
 * @purpose Legacy Sequelize model for user_notification_preferences table
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports UserNotificationPreferenceAttributes, UserNotificationPreferenceCreationAttributes, UserNotificationPreference (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class UserNotificationPreference extends sequelize_1.Model {
}
UserNotificationPreference.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    user_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    system_type: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    is_enabled: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "user_notification_preferences",
    timestamps: true,
    underscored: true,
});
exports.default = UserNotificationPreference;
