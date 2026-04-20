"use strict";
/**
 * @file profile.ts
 * @purpose Legacy Sequelize model for profiles table
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports ProfileAttributes, ProfileCreationAttributes, Profile (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class Profile extends sequelize_1.Model {
}
Profile.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        primaryKey: true,
    },
    username: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    security_timestamp: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    telegram_user_id: {
        type: sequelize_1.DataTypes.BIGINT,
        allowNull: true,
        unique: true, // Satu akun Telegram hanya bisa terhubung ke satu profile
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "profiles",
    timestamps: true,
    underscored: true,
});
exports.default = Profile;
