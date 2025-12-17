// backend/src/db/models/proteksiAsetLog.ts

import { DataTypes, Model, CreationOptional } from "sequelize";
import { sequelize } from "../config";

// Tipe insiden yang bisa dideteksi oleh sistem ML
export type IncidentType = "IMPACT" | "VIBRATION" | "THERMAL" | "WATER_LEAK" | "NORMAL";

// Atribut untuk model ProteksiAsetLog
export interface ProteksiAsetLogAttributes {
  id: CreationOptional<number>;
  device_id: string;
  incident_type: IncidentType;
  confidence: number | null;
  data: {
    raw_values?: {
      accX?: number;
      accY?: number;
      accZ?: number;
      gyroX?: number;
      gyroY?: number;
      gyroZ?: number;
      mic_level?: number;
      thermal_avg?: number;
      thermal_max?: number;
      water_level?: number;
    };
    [key: string]: unknown;
  };
  is_cleared: boolean;
  timestamp: CreationOptional<Date>;
  created_at?: Date;
  updated_at?: Date;
}

// Atribut yang diperlukan saat membuat log baru
export type ProteksiAsetLogCreationAttributes = Omit<
  ProteksiAsetLogAttributes,
  "id" | "is_cleared" | "timestamp"
>;

// Model class
class ProteksiAsetLog
  extends Model<ProteksiAsetLogAttributes, ProteksiAsetLogCreationAttributes>
  implements ProteksiAsetLogAttributes
{
  public id!: CreationOptional<number>;
  public device_id!: string;
  public incident_type!: IncidentType;
  public confidence!: number | null;
  public data!: ProteksiAsetLogAttributes["data"];
  public is_cleared!: boolean;
  public timestamp!: CreationOptional<Date>;

  public readonly created_at?: Date;
  public readonly updated_at?: Date;
}

ProteksiAsetLog.init(
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    device_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    incident_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [["IMPACT", "VIBRATION", "THERMAL", "WATER_LEAK", "NORMAL"]],
      },
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    is_cleared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "proteksi_aset_logs",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default ProteksiAsetLog;
