/**
 * @file area.ts
 * @purpose Legacy Sequelize model for areas table
 * @usedBy Legacy compatibility (runtime uses Drizzle schema.ts)
 * @deps sequelize, db/config
 * @exports AreaAttributes, AreaCreationAttributes, Area (default)
 * @sideEffects None
 */


import { Model, DataTypes, UUIDV4, CreationOptional } from "sequelize";
import { sequelize } from "../config";

export interface AreaAttributes {
  id: CreationOptional<string>;
  warehouse_id: string;
  name: string;
}

export type AreaCreationAttributes = Omit<AreaAttributes, "id">;

class Area
  extends Model<AreaAttributes, AreaCreationAttributes>
  implements AreaAttributes
{
  public id!: CreationOptional<string>;
  public warehouse_id!: string;
  public name!: string;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Area.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    warehouse_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "areas",
    timestamps: true,
    underscored: true,
  }
);

export default Area;
