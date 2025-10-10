"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
const sequelize_1 = require("sequelize");
require("dotenv/config");
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    throw new Error("DATABASE_URL environment variable is not set!");
}
exports.sequelize = new sequelize_1.Sequelize(dbUrl, {
    dialect: "postgres",
    logging: false, // Set ke `console.log` untuk debug query SQL
});
