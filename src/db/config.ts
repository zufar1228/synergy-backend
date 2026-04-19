/**
 * @file config.ts
 * @purpose Legacy Sequelize connection configuration (kept for model compatibility)
 * @usedBy Legacy Sequelize models
 * @deps sequelize, env
 * @exports sequelize
 * @sideEffects DB connection pool initialization
 */

import { Sequelize } from 'sequelize';
import { env } from '../config/env';

export const sequelize = new Sequelize(env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false
});
