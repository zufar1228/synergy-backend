"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class PushSubscription extends sequelize_1.Model {
}
PushSubscription.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    user_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    endpoint: { type: sequelize_1.DataTypes.TEXT, allowNull: false, unique: true },
    p256dh: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    auth: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
}, {
    sequelize: config_1.sequelize,
    tableName: 'push_subscriptions',
    timestamps: true,
    underscored: true,
});
exports.default = PushSubscription;
