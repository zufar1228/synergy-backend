// backend/src/db/models/lingkunganLog.ts

import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize";
import { sequelize } from "../config";

export interface LingkunganLogAttributes {
  id: CreationOptional<string>;
  device_id: string;
  timestamp: Date;
  payload: object;
  temperature?: number | null;
  humidity?: number | null;
  co2_ppm?: number | null;
}

export type LingkunganLogCreationAttributes = Omit<
  LingkunganLogAttributes,
  "id"
>;

class LingkunganLog
  extends Model<LingkunganLogAttributes, LingkunganLogCreationAttributes>
  implements LingkunganLogAttributes
{
  public id!: CreationOptional<string>;
  public device_id!: string;
  public timestamp!: Date;
  public payload!: object;
  public temperature!: number | null;
  public humidity!: number | null;
  public co2_ppm!: number | null;
}

LingkunganLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    device_id: { type: DataTypes.UUID, allowNull: false },
    timestamp: { type: DataTypes.DATE, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false },
    temperature: { type: DataTypes.DECIMAL, allowNull: true },
    humidity: { type: DataTypes.DECIMAL, allowNull: true }, // ✅ UBAH DARI INTEGER KE DECIMAL
    co2_ppm: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: "lingkungan_logs",
    timestamps: false,
    underscored: true,
  }
);

export default LingkunganLog;
