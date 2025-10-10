"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/profile.ts
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
}, {
    sequelize: config_1.sequelize,
    tableName: "profiles",
    timestamps: true,
    underscored: true,
});
exports.default = Profile;
