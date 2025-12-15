// backend/src/db/models/profile.ts
import { Model, DataTypes, CreationOptional } from "sequelize";
import { sequelize } from "../config";

export interface ProfileAttributes {
  id: string; // Ini adalah UUID dari auth.users
  username: string;
  security_timestamp: Date;
  telegram_user_id: number | null; // Telegram user ID for auto-kick feature
}

// Atribut yang dibutuhkan saat membuat profil baru
export interface ProfileCreationAttributes {
  id: string;
  username: string;
  security_timestamp?: Date;
  telegram_user_id?: number | null;
}

class Profile
  extends Model<ProfileAttributes, ProfileCreationAttributes>
  implements ProfileAttributes
{
  public id!: string;
  public username!: string;
  public security_timestamp!: Date;
  public telegram_user_id!: number | null;

  // Timestamps
  public readonly createdAt!: CreationOptional<Date>;
  public readonly updatedAt!: CreationOptional<Date>;
}

Profile.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    username: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    security_timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    telegram_user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
      unique: true, // Satu akun Telegram hanya bisa terhubung ke satu profile
    },
  },
  {
    sequelize,
    tableName: "profiles",
    timestamps: true,
    underscored: true,
  }
);

export default Profile;
