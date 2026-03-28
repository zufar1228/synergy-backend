// backend/src/db/models/intrusiLog.ts
import { Model, DataTypes, UUIDV4, CreationOptional } from 'sequelize';
import { sequelize } from '../../../db/config';

/**
 * Event types from door security system (spec v20 — Windowed Threshold Algorithm):
 * - IMPACT_WARNING: Δg ≥ TH_HIT detected, anomaly_count incremented within window
 * - FORCED_ENTRY_ALARM: anomaly_count >= WINDOW_THRESHOLD within 45-second window → alarm triggered
 * - UNAUTHORIZED_OPEN: reed switch detected door open while ARMED
 * - POWER_SOURCE_CHANGED: mains ↔ battery transition
 * - BATTERY_LEVEL_CHANGED: battery hysteresis level transition (NORMAL/LOW/CRITICAL)
 * - SIREN_SILENCED: siren silenced via remote command
 * - ARM: system armed
 * - DISARM: system disarmed
 */
export type IntrusiEventType =
  | 'IMPACT_WARNING'
  | 'FORCED_ENTRY_ALARM'
  | 'UNAUTHORIZED_OPEN'
  | 'POWER_SOURCE_CHANGED'
  | 'BATTERY_LEVEL_CHANGED'
  | 'SIREN_SILENCED'
  | 'ARM'
  | 'DISARM';

export type DoorState = 'OPEN' | 'CLOSED';
export type SystemState = 'ARMED' | 'DISARMED';
export type AcknowledgeStatus =
  | 'unacknowledged'
  | 'acknowledged'
  | 'resolved'
  | 'false_alarm';

export interface IntrusiLogAttributes {
  id: CreationOptional<string>;
  device_id: string;
  timestamp: CreationOptional<Date>;
  event_type: IntrusiEventType;
  system_state: SystemState;
  door_state: DoorState;
  peak_delta_g: number | null;
  hit_count: number | null;
  payload: object | null;
  status: CreationOptional<AcknowledgeStatus>;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  notes: string | null;
  notification_sent_at: Date | null;
}

export type IntrusiLogCreationAttributes = Omit<
  IntrusiLogAttributes,
  | 'id'
  | 'timestamp'
  | 'status'
  | 'acknowledged_by'
  | 'acknowledged_at'
  | 'notes'
  | 'notification_sent_at'
>;

class IntrusiLog
  extends Model<IntrusiLogAttributes, IntrusiLogCreationAttributes>
  implements IntrusiLogAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public timestamp!: CreationOptional<Date>;
  public event_type!: IntrusiEventType;
  public system_state!: SystemState;
  public door_state!: DoorState;
  public peak_delta_g!: number | null;
  public hit_count!: number | null;
  public payload!: object | null;
  public status!: CreationOptional<AcknowledgeStatus>;
  public acknowledged_by!: string | null;
  public acknowledged_at!: Date | null;
  public notes!: string | null;
  public notification_sent_at!: Date | null;
}

IntrusiLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    event_type: { type: DataTypes.TEXT, allowNull: false },
    system_state: { type: DataTypes.TEXT, allowNull: false },
    door_state: { type: DataTypes.TEXT, allowNull: false },
    peak_delta_g: { type: DataTypes.REAL, allowNull: true },
    hit_count: { type: DataTypes.INTEGER, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: true },
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
    tableName: 'intrusi_logs',
    timestamps: false,
    underscored: true
  }
);

export default IntrusiLog;
