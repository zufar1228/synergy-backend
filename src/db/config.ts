import { Sequelize } from "sequelize";
import "dotenv/config";

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL environment variable is not set!");
}

export const sequelize = new Sequelize(dbUrl, {
  dialect: "postgres",
  logging: false, // Set ke `console.log` untuk debug query SQL
});
