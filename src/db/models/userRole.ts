import { Model, DataTypes } from "sequelize";
import { sequelize } from "../config";

class UserRole extends Model {
  public user_id!: string;
  public role!: "admin" | "user" | "super_admin";
}

UserRole.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
    role: {
      type: DataTypes.ENUM("admin", "user", "super_admin"),
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "user_roles",
    timestamps: false,
  }
);

export { UserRole };
