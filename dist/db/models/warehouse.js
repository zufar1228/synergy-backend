"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config"); // Kita akan buat file config ini nanti
class Warehouse extends sequelize_1.Model {
}
Warehouse.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
    location: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "warehouses",
    timestamps: true,
    underscored: true,
});
exports.default = Warehouse;
