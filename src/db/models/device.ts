// backend/src/db/models/device.ts

import { Model, DataTypes, UUIDV4, CreationOptional } from 'sequelize'; // <-- IMPORT CreationOptional
import { sequelize } from '../config';

export type DeviceStatus = 'Online' | 'Offline';
export type FanStatus = 'On' | 'Off';
export type DoorState = 'OPEN' | 'CLOSED';
export type IntrusiSystemState = 'ARMED' | 'DISARMED';
export type SirenState = 'ON' | 'COOLDOWN' | 'OFF';
export type PowerSource = 'MAINS' | 'BATTERY';

export interface DeviceAttributes {
  id: CreationOptional<string>;
  area_id: string;
  name: string;
  system_type: string;
  status: CreationOptional<DeviceStatus>;
  last_heartbeat?: Date | null;
  fan_status: CreationOptional<FanStatus>;
  door_state?: DoorState | null;
  intrusi_system_state?: IntrusiSystemState | null;
  siren_state?: SirenState | null;
  power_source?: PowerSource | null;
  vbat_voltage?: number | null;
  vbat_pct?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// Definisikan tipe untuk pembuaatan, yang digunakan oleh method .create()
export type DeviceCreationAttributes = Omit<
  DeviceAttributes,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

class Device
  extends Model<DeviceAttributes, DeviceCreationAttributes>
  implements DeviceAttributes
{
  public id!: CreationOptional<string>;
  public area_id!: string;
  public name!: string;
  public system_type!: string;
  public status!: CreationOptional<DeviceStatus>;
  public last_heartbeat!: Date | null;
  public fan_status!: CreationOptional<FanStatus>;
  public door_state!: DoorState | null;
  public intrusi_system_state!: IntrusiSystemState | null;
  public siren_state!: SirenState | null;
  public power_source!: PowerSource | null;
  public vbat_voltage!: number | null;
  public vbat_pct!: number | null;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Device.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true
    },
    area_id: {
      type: DataTypes.UUID,
      allowNull: false
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    system_type: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('Online', 'Offline'),
      allowNull: false,
      defaultValue: 'Offline'
    },
    last_heartbeat: {
      type: DataTypes.DATE,
      allowNull: true
    },
    fan_status: {
      type: DataTypes.ENUM('On', 'Off'),
      allowNull: false,
      defaultValue: 'Off'
    },
    door_state: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    intrusi_system_state: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    siren_state: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    power_source: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    vbat_voltage: {
      type: DataTypes.REAL,
      allowNull: true,
      defaultValue: null
    },
    vbat_pct: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    }
  },
  {
    sequelize,
    tableName: 'devices',
    timestamps: true,
    underscored: true
  }
);

export default Device;
