import { Model, DataTypes, UUIDV4, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config';

class PushSubscription extends Model<InferAttributes<PushSubscription>, InferCreationAttributes<PushSubscription>> {
  declare id: CreationOptional<string>;
  declare user_id: string;
  declare endpoint: string;
  declare p256dh: string;
  declare auth: string;
}

PushSubscription.init({
  id: { type: DataTypes.UUID, defaultValue: UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  endpoint: { type: DataTypes.TEXT, allowNull: false, unique: true },
  p256dh: { type: DataTypes.TEXT, allowNull: false },
  auth: { type: DataTypes.TEXT, allowNull: false },
}, {
  sequelize,
  tableName: 'push_subscriptions',
  timestamps: true,
  underscored: true,
});

export default PushSubscription;