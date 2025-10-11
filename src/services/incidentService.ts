// backend/src/services/incidentService.ts
import { Incident } from "../db/models";
import { IncidentStatus } from "../db/models/incident";
import ApiError from "../utils/apiError";

export const updateIncidentStatus = async (
  incidentId: string,
  userId: string,
  status: IncidentStatus,
  notes?: string
) => {
  const incident = await Incident.findByPk(incidentId);
  if (!incident) {
    throw new ApiError(404, "Insiden tidak ditemukan.");
  }

  incident.status = status;
  incident.notes = notes || incident.notes; // Hanya update notes jika ada
  incident.acknowledged_by = userId;
  incident.acknowledged_at = new Date();

  await incident.save();
  return incident;
};
