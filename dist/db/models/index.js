"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDatabase = exports.db = void 0;
// Re-export Drizzle schema and client as the canonical database layer.
// Legacy Sequelize models are no longer used at runtime.
var drizzle_1 = require("../drizzle");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return drizzle_1.db; } });
__exportStar(require("../schema"), exports);
// Connection test utility (replaces old syncDatabase)
const drizzle_2 = require("../drizzle");
const drizzle_orm_1 = require("drizzle-orm");
const initDatabase = async () => {
    try {
        await drizzle_2.db.execute((0, drizzle_orm_1.sql) `SELECT 1`);
        console.log('Database connection established successfully.');
    }
    catch (error) {
        console.error('Unable to connect to the database:', error);
        throw error;
    }
};
exports.initDatabase = initDatabase;
