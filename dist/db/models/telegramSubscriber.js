"use strict";
/**
 * @file telegramSubscriber.ts
 * @purpose Legacy Sequelize model for telegram_subscribers table
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports TelegramSubscriberAttributes, TelegramSubscriberCreationAttributes, TelegramSubscriber (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class TelegramSubscriber extends sequelize_1.Model {
}
TelegramSubscriber.init({
    user_id: {
        type: sequelize_1.DataTypes.BIGINT,
        primaryKey: true,
        allowNull: false,
    },
    username: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    first_name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
    status: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: 'active',
        validate: {
            isIn: [['active', 'left', 'kicked']],
        },
    },
    joined_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
    },
    left_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
    kicked_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: 'telegram_subscribers',
    timestamps: true,
    underscored: true,
});
exports.default = TelegramSubscriber;
