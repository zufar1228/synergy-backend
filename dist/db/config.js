"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
const sequelize_1 = require("sequelize");
const env_1 = require("../config/env");
exports.sequelize = new sequelize_1.Sequelize(env_1.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false
});
