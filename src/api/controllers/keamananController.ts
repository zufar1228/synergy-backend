// backend/src/api/controllers/keamananController.ts
import { Request, Response } from "express";
import * as keamananService from "../../services/keamananService";
import { findAndNotifyRepeatDetections } from "../../services/repeatDetectionService";
import { IncidentStatus } from "../../db/models/incident";
import ApiError from "../../utils/apiError";

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  // Log error yang tidak terduga untuk debugging
  console.error("Unhandled Error in KeamananController:", error);
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

    const updatedLog = await keamananService.updateKeamananLogStatus(
      id,
      userId,
      status as IncidentStatus,
      notes
    );
    res.status(200).json(updatedLog);
  } catch (error) {
    handleError(res, error);
  }
};

export const triggerRepeatDetection = async (req: Request, res: Response) => {
  try {
    console.log("[KeamananController] Triggering repeat detection notifications...");
    await findAndNotifyRepeatDetections();
    res.status(200).json({ message: "Repeat detection notifications triggered successfully" });
  } catch (error) {
    console.error("[KeamananController] Error triggering repeat detection:", error);
    handleError(res, error);
  }
};
