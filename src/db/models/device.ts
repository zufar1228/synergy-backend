// backend/src/db/models/device.ts

import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize"; // <-- IMPORT CreationOptional
import { sequelize } from "../config";

export type DeviceStatus = "Online" | "Offline";

// Interface ini sekarang secara akurat merefleksikan model kita
export interface DeviceAttributes {
  id: CreationOptional<string>; // <-- Tandai sebagai CreationOptional
  area_id: string;
  name: string;
  system_type: string;
  status: CreationOptional<DeviceStatus>; // <-- Tandai sebagai CreationOptional
  last_heartbeat?: Date | null; // Bisa null atau undefined
  createdAt?: Date;
  updatedAt?: Date;
}

// Definisikan tipe untuk pembuatan, yang digunakan oleh method .create()
export type DeviceCreationAttributes = Omit<
  DeviceAttributes,
  "id" | "status" | "createdAt" | "updatedAt"
>;

class Device
  extends Model<DeviceAttributes, DeviceCreationAttributes>
  // <-- Berikan kedua tipe ke Model
  implements DeviceAttributes
{
  public id!: CreationOptional<string>;
  public area_id!: string;
  public name!: string;
  public system_type!: string;
  public status!: CreationOptional<DeviceStatus>;
  public last_heartbeat!: Date | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Device.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    area_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    system_type: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("Online", "Offline"),
      allowNull: false,
      defaultValue: "Offline",
    },
    last_heartbeat: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "devices",
    timestamps: true,
    underscored: true,
  }
);

export default Device;
