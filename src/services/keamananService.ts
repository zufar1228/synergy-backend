// backend/src/services/keamananService.ts
import { KeamananLog } from "../db/models";
import { IncidentStatus } from "../db/models/incident";
import ApiError from "../utils/apiError";

export const updateKeamananLogStatus = async (
  logId: string,
  userId: string,
  status: IncidentStatus,
  notes?: string
) => {
  const log = await KeamananLog.findByPk(logId);
  if (!log) throw new ApiError(404, "Log keamanan tidak ditemukan.");

  log.status = status;
  log.notes = notes || log.notes;
  log.acknowledged_by = userId;
  log.acknowledged_at = new Date();

  await log.save();
  return log;
};
