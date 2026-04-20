"use strict";
/**
 * @file area.ts
 * @purpose Legacy Sequelize model for areas table
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports AreaAttributes, AreaCreationAttributes, Area (default)
 * @sideEffects None
 */
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class Area extends sequelize_1.Model {
}
Area.init({
    id: {
        type: sequelize_1.DataTypes.UUID,
        defaultValue: sequelize_1.UUIDV4,
        primaryKey: true,
    },
    warehouse_id: {
        type: sequelize_1.DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
    },
}, {
    sequelize: config_1.sequelize,
    tableName: "areas",
    timestamps: true,
    underscored: true,
});
exports.default = Area;
