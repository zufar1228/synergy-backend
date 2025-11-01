// backend/src/db/models/keamananLog.ts
import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize";
import { sequelize } from "../config";
import { IncidentStatus } from "./incident";

export interface KeamananLogAttributes {
  id: CreationOptional<string>;
  device_id: string;
  created_at: CreationOptional<Date>;
  image_url: string;
  detected: boolean;
  box: object | null;
  confidence: number | null;
  attributes: object | null;
  status: CreationOptional<IncidentStatus>;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  notes: string | null;
  notification_sent_at: Date | null; // <-- TAMBAHKAN INI
}

export type KeamananLogCreationAttributes = Omit<
  KeamananLogAttributes,
  | "id"
  | "created_at"
  | "status"
  | "acknowledged_by"
  | "acknowledged_at"
  | "notes"
  | "notification_sent_at"
>; // <-- TAMBAHKAN INI

class KeamananLog
  extends Model<KeamananLogAttributes, KeamananLogCreationAttributes>
  implements KeamananLogAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public created_at!: CreationOptional<Date>;
  public image_url!: string;
  public detected!: boolean;
  public box!: object | null;
  public confidence!: number | null;
  public attributes!: object | null;
  public status!: CreationOptional<IncidentStatus>;
  public acknowledged_by!: string | null;
  public acknowledged_at!: Date | null;
  public notes!: string | null;
  public notification_sent_at!: Date | null; // <-- TAMBAHKAN INI
}

KeamananLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    image_url: { type: DataTypes.TEXT, allowNull: false },
    detected: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    box: { type: DataTypes.JSONB, allowNull: true },
    confidence: { type: DataTypes.REAL, allowNull: true },
    attributes: { type: DataTypes.JSONB, allowNull: true },
    status: {
      type: DataTypes.ENUM(
        "unacknowledged",
        "acknowledged",
        "resolved",
        "false_alarm"
      ),
      defaultValue: "unacknowledged",
      allowNull: false,
    },
    acknowledged_by: { type: DataTypes.UUID, allowNull: true },
    acknowledged_at: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    notification_sent_at: { type: DataTypes.DATE, allowNull: true }, // <-- TAMBAHKAN INI
  },
  {
    sequelize,
    tableName: "keamanan_logs",
    timestamps: false,
    underscored: true,
  }
);

export default KeamananLog;
