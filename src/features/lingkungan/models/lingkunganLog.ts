/**
 * @file lingkunganLog.ts
 * @purpose Legacy Sequelize model for lingkungan (environment) sensor logs
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports AcknowledgeStatus, LingkunganLogAttributes, LingkunganLogCreationAttributes, LingkunganLog (default)
 * @sideEffects None
 */

import { Model, DataTypes, UUIDV4, CreationOptional } from 'sequelize';
import { sequelize } from '../../../db/config';

export type AcknowledgeStatus =
  | 'unacknowledged'
  | 'acknowledged'
  | 'resolved'
  | 'false_alarm';

export interface LingkunganLogAttributes {
  id: CreationOptional<string>;
  device_id: string;
  timestamp: CreationOptional<Date>;
  temperature: number;
  humidity: number;
  co2: number;
  status: CreationOptional<AcknowledgeStatus>;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  notes: string | null;
  notification_sent_at: Date | null;
}

export type LingkunganLogCreationAttributes = Omit<
  LingkunganLogAttributes,
  | 'id'
  | 'timestamp'
  | 'status'
  | 'acknowledged_by'
  | 'acknowledged_at'
  | 'notes'
  | 'notification_sent_at'
>;

class LingkunganLog
  extends Model<LingkunganLogAttributes, LingkunganLogCreationAttributes>
  implements LingkunganLogAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public timestamp!: CreationOptional<Date>;
  public temperature!: number;
  public humidity!: number;
  public co2!: number;
  public status!: CreationOptional<AcknowledgeStatus>;
  public acknowledged_by!: string | null;
  public acknowledged_at!: Date | null;
  public notes!: string | null;
  public notification_sent_at!: Date | null;
}

LingkunganLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    temperature: { type: DataTypes.REAL, allowNull: false },
    humidity: { type: DataTypes.REAL, allowNull: false },
    co2: { type: DataTypes.REAL, allowNull: false },
    status: {
      type: DataTypes.ENUM(
        'unacknowledged',
        'acknowledged',
        'resolved',
        'false_alarm'
      ),
      defaultValue: 'unacknowledged',
      allowNull: false
    },
    acknowledged_by: { type: DataTypes.UUID, allowNull: true },
    acknowledged_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    notification_sent_at: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'lingkungan_logs',
    timestamps: false,
    underscored: true
  }
);

export default LingkunganLog;
