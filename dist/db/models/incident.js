"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/incident.ts
const sequelize_1 = require("sequelize");
const config_1 = require("../config");
class Incident extends sequelize_1.Model {
}
Incident.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    created_at: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    incident_type: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    confidence: { type: sequelize_1.DataTypes.REAL, allowNull: true },
    raw_features: { type: sequelize_1.DataTypes.JSONB, allowNull: true },
    status: {
        type: sequelize_1.DataTypes.ENUM("unacknowledged", "acknowledged", "resolved", "false_alarm"),
        defaultValue: "unacknowledged",
        allowNull: false,
    },
    acknowledged_by: { type: sequelize_1.DataTypes.UUID, allowNull: true },
    acknowledged_at: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
}, {
    sequelize: config_1.sequelize,
    tableName: "incidents",
    timestamps: false,
    underscored: true,
});
exports.default = Incident;
