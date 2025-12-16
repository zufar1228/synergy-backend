// backend/src/db/models/intrusiLog.ts
import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize";
import { sequelize } from "../config";

// Enum type untuk event class TinyML
export type IntrusiEventClass = "Normal" | "Disturbance" | "Intrusion";

export interface IntrusiLogAttributes {
  id: CreationOptional<string>;
  device_id: string;
  event_class: IntrusiEventClass;
  confidence: number;
  payload: object | null;
  timestamp: CreationOptional<Date>;
}

export type IntrusiLogCreationAttributes = Omit<
  IntrusiLogAttributes,
  "id"
>;

class IntrusiLog
  extends Model<IntrusiLogAttributes, IntrusiLogCreationAttributes>
  implements IntrusiLogAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public event_class!: IntrusiEventClass;
  public confidence!: number;
  public payload!: object | null;
  public timestamp!: CreationOptional<Date>;
}

IntrusiLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    event_class: {
      type: DataTypes.ENUM("Normal", "Disturbance", "Intrusion"),
      allowNull: false,
    },
    confidence: { type: DataTypes.DECIMAL(5, 4), allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: true },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "intrusi_logs",
    timestamps: false, // Kita pakai timestamp manual dari device/default
    underscored: true,
  }
);

export default IntrusiLog;
