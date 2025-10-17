// backend/src/db/models/userNotificationPreference.ts
import { Model, DataTypes, CreationOptional, UUIDV4 } from "sequelize";
import { sequelize } from "../config";

export interface UserNotificationPreferenceAttributes {
  id: CreationOptional<string>;
  user_id: string;
  system_type: string;
  is_enabled: boolean;
}

// Atribut yang dibutuhkan saat membuat preferensi baru
export type UserNotificationPreferenceCreationAttributes = Omit<UserNotificationPreferenceAttributes, 'id'>;

class UserNotificationPreference
  extends Model<UserNotificationPreferenceAttributes, UserNotificationPreferenceCreationAttributes>
  implements UserNotificationPreferenceAttributes
{
  public id!: CreationOptional<string>;
  public user_id!: string;
  public system_type!: string;
  public is_enabled!: boolean;
}

UserNotificationPreference.init(
  {
    id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    system_type: { type: DataTypes.TEXT, allowNull: false },
    is_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "user_notification_preferences",
    timestamps: true,
    underscored: true,
  }
);

export default UserNotificationPreference;
