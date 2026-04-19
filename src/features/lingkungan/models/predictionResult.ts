/**
 * @file predictionResult.ts
 * @purpose Legacy Sequelize model for ML prediction results
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports PredictionResultAttributes, PredictionResultCreationAttributes, PredictionResult (default)
 * @sideEffects None
 */

import { Model, DataTypes, UUIDV4, CreationOptional } from 'sequelize';
import { sequelize } from '../../../db/config';

export interface PredictionResultAttributes {
  id: CreationOptional<string>;
  device_id: string;
  timestamp: CreationOptional<Date>;
  predicted_temperature: number;
  predicted_humidity: number;
  predicted_co2: number;
  prediction_horizon_min: CreationOptional<number>;
  fan_triggered: CreationOptional<boolean>;
  dehumidifier_triggered: CreationOptional<boolean>;
  alert_sent: CreationOptional<boolean>;
}

export type PredictionResultCreationAttributes = Omit<
  PredictionResultAttributes,
  | 'id'
  | 'prediction_horizon_min'
  | 'fan_triggered'
  | 'dehumidifier_triggered'
  | 'alert_sent'
>;

class PredictionResult
  extends Model<PredictionResultAttributes, PredictionResultCreationAttributes>
  implements PredictionResultAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public timestamp!: CreationOptional<Date>;
  public predicted_temperature!: number;
  public predicted_humidity!: number;
  public predicted_co2!: number;
  public prediction_horizon_min!: CreationOptional<number>;
  public fan_triggered!: CreationOptional<boolean>;
  public dehumidifier_triggered!: CreationOptional<boolean>;
  public alert_sent!: CreationOptional<boolean>;
}

PredictionResult.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    predicted_temperature: { type: DataTypes.REAL, allowNull: false },
    predicted_humidity: { type: DataTypes.REAL, allowNull: false },
    predicted_co2: { type: DataTypes.REAL, allowNull: false },
    prediction_horizon_min: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 15
    },
    fan_triggered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    dehumidifier_triggered: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    alert_sent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    sequelize,
    tableName: 'prediction_results',
    timestamps: false,
    underscored: true
  }
);

export default PredictionResult;
