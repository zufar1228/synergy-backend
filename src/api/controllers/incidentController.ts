// backend/src/api/controllers/incidentController.ts
import { Request, Response } from "express";
import * as incidentService from "../../services/incidentService";
import { IncidentStatus } from "../../db/models/incident";
import ApiError from "../../utils/apiError";

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  // Log error yang tidak terduga untuk debugging
  console.error("Unhandled Error in IncidentController:", error);
  return res
    .status(500)
    .json({ message: "An unexpected internal server error occurred." });
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, "User tidak terautentikasi.");
    }
    if (!status) {
      return res.status(400).json({ message: "Status wajib diisi." });
    }

    const updatedIncident = await incidentService.updateIncidentStatus(
      id,
      userId,
      status as IncidentStatus,
      notes
    );
    res.status(200).json(updatedIncident);
  } catch (error) {
    handleError(res, error);
  }
};
