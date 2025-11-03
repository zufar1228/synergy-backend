"use strict";
// backend/src/db/models/lingkunganLog.ts
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class LingkunganLog extends sequelize_1.Model {
}
LingkunganLog.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    timestamp: { type: sequelize_1.DataTypes.DATE, allowNull: false },
    payload: { type: sequelize_1.DataTypes.JSONB, allowNull: false },
    temperature: { type: sequelize_1.DataTypes.DECIMAL, allowNull: true },
    humidity: { type: sequelize_1.DataTypes.DECIMAL, allowNull: true }, // ✅ UBAH DARI INTEGER KE DECIMAL
    co2_ppm: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
}, {
    sequelize: config_1.sequelize,
    tableName: "lingkungan_logs",
    timestamps: false,
    underscored: true,
});
exports.default = LingkunganLog;
