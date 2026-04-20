"use strict";
/**
 * @file keamananService.ts
 * @purpose Updates keamanan log incident status (acknowledge/resolve/false_alarm)
 * @usedBy keamananController
 * @deps db/drizzle, schema (keamanan_logs), ApiError
 * @exports updateKeamananLogStatus
 * @sideEffects DB write (keamanan_logs)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateKeamananLogStatus = void 0;
const drizzle_1 = require("../../../db/drizzle");
const schema_1 = require("../../../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../../../utils/apiError"));
const updateKeamananLogStatus = async (logId, userId, status, notes) => {
    const [existing] = await drizzle_1.db
        .select()
        .from(schema_1.keamanan_logs)
        .where((0, drizzle_orm_1.eq)(schema_1.keamanan_logs.id, logId))
        .limit(1);
    if (!existing)
        throw new apiError_1.default(404, 'Log keamanan tidak ditemukan.');
    const [updated] = await drizzle_1.db
        .update(schema_1.keamanan_logs)
        .set({
        status,
        notes: notes || existing.notes,
        acknowledged_by: userId,
        acknowledged_at: new Date()
    })
        .where((0, drizzle_orm_1.eq)(schema_1.keamanan_logs.id, logId))
        .returning();
    return updated;
};
exports.updateKeamananLogStatus = updateKeamananLogStatus;
