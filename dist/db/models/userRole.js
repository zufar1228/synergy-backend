"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = void 0;
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class UserRole extends sequelize_1.Model {
}
exports.UserRole = UserRole;
UserRole.init({
    id: { type: sequelize_1.DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    user_id: { type: sequelize_1.DataTypes.UUID, allowNull: false, unique: true },
    role: {
        type: sequelize_1.DataTypes.ENUM("admin", "user", "super_admin"),
        allowNull: false,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "user_roles",
    timestamps: false,
});
