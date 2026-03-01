// backend/src/db/models/intrusiLog.ts
import { Model, DataTypes, UUIDV4, CreationOptional } from 'sequelize';
import { sequelize } from '../config';

/**
 * Event types from door security system (spec v18):
 * - IMPACT_WARNING: single hit detected (hit_count < COUNT_LIMIT)
 * - FORCED_ENTRY_ALARM: 2 hits within window → alarm
 * - UNAUTHORIZED_OPEN: reed switch detected door open while ARMED
 * - POWER_SOURCE_CHANGED: mains ↔ battery transition
 * - CALIB_SAVED: calibration completed and parameters saved
 * - CALIB_ABORTED: calibration timed out
 * - SIREN_SILENCED: siren silenced via remote command
 * - ARM: system armed
 * - DISARM: system disarmed
 */
export type IntrusiEventType =
  | 'IMPACT_WARNING'
  | 'FORCED_ENTRY_ALARM'
  | 'UNAUTHORIZED_OPEN'
  | 'POWER_SOURCE_CHANGED'
  | 'CALIB_SAVED'
  | 'CALIB_ABORTED'
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
