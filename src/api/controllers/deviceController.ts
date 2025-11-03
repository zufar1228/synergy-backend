// backend/src/api/controllers/deviceController.ts

import { Request, Response } from "express";
import * as deviceService from "../../services/deviceService";
import * as actuationService from "../../services/actuationService"; // <-- IMPORT ACTUATION SERVICE
import { FanStatus } from "../../db/models/device"; // <-- IMPORT TIPE FANSTATUS
import ApiError from "../../utils/apiError";

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error("Unhandled Error:", error);
  return res.status(500).json({ message: "An unexpected error occurred." });
};

export const listDevices = async (_req: Request, res: Response) => {
  try {
    const data = await deviceService.getAllDevices();
    res.status(200).json(data);
  } catch (error) {
    handleError(res, error);
  }
};

export const getDeviceById = async (req: Request, res: Response) => {
  try {
    const data = await deviceService.getDeviceById(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    handleError(res, error);
  }
};

export const createDevice = async (req: Request, res: Response) => {
  try {
    const result = await deviceService.createDevice(req.body);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const updateDevice = async (req: Request, res: Response) => {
  try {
    const device = await deviceService.updateDevice(req.params.id, req.body);
    res.status(200).json(device);
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteDevice = async (req: Request, res: Response) => {
  try {
    await deviceService.deleteDevice(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};

// --- TAMBAHKAN FUNGSI BARU INI ---
export const getDeviceDetailsByArea = async (req: Request, res: Response) => {
  try {
    const { area_id, system_type } = req.query;

    // Validasi yang lebih strict
    if (typeof area_id !== "string" || typeof system_type !== "string") {
      throw new ApiError(
        400,
        "Query parameter area_id dan system_type wajib berupa string."
      );
    }

    const data = await deviceService.getDeviceByAreaAndSystem(
      area_id,
      system_type
    );
    res.status(200).json(data);
  } catch (error) {
    handleError(res, error);
  }
};

// --- TAMBAHKAN FUNGSI BARU INI ---
export const sendManualCommand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // Sudah divalidasi oleh Zod

    // ❌ Hapus validasi manual ini (sudah ditangani Zod)
    // if (!action || !['On', 'Off'].includes(action)) {
    //   throw new ApiError(400, 'Aksi tidak valid. Kirim "On" atau "Off".');
    // }

    await actuationService.controlFanRelay(id, action as FanStatus);

    res.status(200).json({
      message: `Perintah manual '${action}' berhasil dikirim.`,
      device_id: id,
      action: action,
    });
  } catch (error) {
    handleError(res, error);
  }
};
