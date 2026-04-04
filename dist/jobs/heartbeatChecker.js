"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHeartbeatJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const SEVEN_MINUTES_AGO = 7 * 60 * 1000;
const checkHeartbeats = async () => {
    console.log('[Cron Job] Running heartbeat check...');
    const cutoffTime = new Date(Date.now() - SEVEN_MINUTES_AGO);
    try {
        const result = await drizzle_1.db
            .update(schema_1.devices)
            .set({ status: 'Offline' })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.devices.status, 'Online'), (0, drizzle_orm_1.lt)(schema_1.devices.last_heartbeat, cutoffTime)))
            .returning({ id: schema_1.devices.id });
        if (result.length > 0) {
            console.log(`[Cron Job] Marked ${result.length} device(s) as Offline.`);
        }
    }
    catch (error) {
        console.error('[Cron Job] Error checking heartbeats:', error);
    }
};
const startHeartbeatJob = () => {
    const task = node_cron_1.default.schedule('*/1 * * * *', checkHeartbeats);
    console.log('[Cron Job] Heartbeat checker scheduled to run every minute.');
    return task;
};
exports.startHeartbeatJob = startHeartbeatJob;
