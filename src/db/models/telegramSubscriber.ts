// backend/src/db/models/telegramSubscriber.ts
import { Model, DataTypes, CreationOptional, Optional } from 'sequelize';
import { sequelize } from '../config';

// Attributes interface
export interface TelegramSubscriberAttributes {
  user_id: number; // Telegram user ID (BIGINT)
  username: string | null;
  first_name: string | null;
  status: 'active' | 'left' | 'kicked';
  joined_at: Date;
  left_at: Date | null;
  kicked_at: Date | null;
}

// Creation attributes (user_id is required, others optional)
export interface TelegramSubscriberCreationAttributes 
  extends Optional<TelegramSubscriberAttributes, 'username' | 'first_name' | 'status' | 'joined_at' | 'left_at' | 'kicked_at'> {}

class TelegramSubscriber 
  extends Model<TelegramSubscriberAttributes, TelegramSubscriberCreationAttributes>
  implements TelegramSubscriberAttributes 
{
  public user_id!: number;
  public username!: string | null;
  public first_name!: string | null;
  public status!: 'active' | 'left' | 'kicked';
  public joined_at!: Date;
  public left_at!: Date | null;
  public kicked_at!: Date | null;

  // Timestamps managed by Sequelize
  public readonly createdAt!: CreationOptional<Date>;
  public readonly updatedAt!: CreationOptional<Date>;
}

TelegramSubscriber.init(
  {
    user_id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
    },
    username: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    first_name: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'left', 'kicked']],
      },
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    left_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    kicked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'telegram_subscribers',
    timestamps: true,
    underscored: true,
  }
);

export default TelegramSubscriber;
