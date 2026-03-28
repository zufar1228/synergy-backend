"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/db/models/predictionResult.ts
const sequelize_1 = require("sequelize");
const config_1 = require("../../../db/config");
class PredictionResult extends sequelize_1.Model {
}
PredictionResult.init({
    id: { type: sequelize_1.DataTypes.UUID, defaultValue: sequelize_1.UUIDV4, primaryKey: true },
    device_id: { type: sequelize_1.DataTypes.UUID, allowNull: false },
    timestamp: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW },
    predicted_temperature: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    predicted_humidity: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    predicted_co2: { type: sequelize_1.DataTypes.REAL, allowNull: false },
    prediction_horizon_min: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15
    },
    fan_triggered: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    dehumidifier_triggered: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    alert_sent: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    sequelize: config_1.sequelize,
    tableName: 'prediction_results',
    timestamps: false,
    underscored: true
});
exports.default = PredictionResult;
