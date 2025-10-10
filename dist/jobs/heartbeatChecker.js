"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHeartbeatJob = void 0;
// backend/src/jobs/heartbeatChecker.ts
const node_cron_1 = __importDefault(require("node-cron"));
const models_1 = require("../db/models");
const sequelize_1 = require("sequelize");
const SEVEN_MINUTES_AGO = 7 * 60 * 1000;
const checkHeartbeats = async () => {
    console.log("[Cron Job] Running heartbeat check...");
    const cutoffTime = new Date(Date.now() - SEVEN_MINUTES_AGO);
    try {
        const [affectedCount] = await models_1.Device.update({ status: "Offline" }, {
            where: {
                status: "Online",
                last_heartbeat: {
                    [sequelize_1.Op.lt]: cutoffTime,
                },
            },
        });
        if (affectedCount > 0) {
            console.log(`[Cron Job] Marked ${affectedCount} device(s) as Offline.`);
        }
    }
    catch (error) {
        console.error("[Cron Job] Error checking heartbeats:", error);
    }
};
// Jadwalkan untuk berjalan setiap menit: '* * * * *'
const startHeartbeatJob = () => {
    node_cron_1.default.schedule("*/1 * * * *", checkHeartbeats);
    console.log("[Cron Job] Heartbeat checker scheduled to run every minute.");
};
exports.startHeartbeatJob = startHeartbeatJob;
