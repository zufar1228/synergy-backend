import { Model, DataTypes, UUIDV4 } from "sequelize";
import { sequelize } from "../config"; // Kita akan buat file config ini nanti

export interface WarehouseAttributes {
  id: string;
  name: string;
  location?: string;
}

class Warehouse
  extends Model<WarehouseAttributes>
  implements WarehouseAttributes
{
  public id!: string;
  public name!: string;
  public location?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Warehouse.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    location: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "warehouses",
    timestamps: true,
    underscored: true,
  }
);

export default Warehouse;
