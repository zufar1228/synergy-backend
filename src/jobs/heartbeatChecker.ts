// backend/src/jobs/heartbeatChecker.ts
import cron from "node-cron";
import { Device } from "../db/models";
import { Op } from "sequelize";

const SEVEN_MINUTES_AGO = 7 * 60 * 1000;

const checkHeartbeats = async () => {
  console.log("[Cron Job] Running heartbeat check...");

  const cutoffTime = new Date(Date.now() - SEVEN_MINUTES_AGO);

  try {
    const [affectedCount] = await Device.update(
      { status: "Offline" },
      {
        where: {
          status: "Online",
          last_heartbeat: {
            [Op.lt]: cutoffTime,
          },
        },
      }
    );

    if (affectedCount > 0) {
      console.log(`[Cron Job] Marked ${affectedCount} device(s) as Offline.`);
    }
  } catch (error) {
    console.error("[Cron Job] Error checking heartbeats:", error);
  }
};

// Jadwalkan untuk berjalan setiap menit: '* * * * *'
export const startHeartbeatJob = () => {
  cron.schedule("*/1 * * * *", checkHeartbeats);
  console.log("[Cron Job] Heartbeat checker scheduled to run every minute.");
};
