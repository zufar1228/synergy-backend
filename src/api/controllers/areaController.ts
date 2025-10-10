// backend/src/api/controllers/areaController.ts
import { Request, Response } from "express";
import * as areaService from "../../services/areaService";
import ApiError from "../../utils/apiError";

// Fungsi error handling generik untuk menghindari repetisi
const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  return res.status(500).json({ message: "An unexpected error occurred." });
};

export const listAreas = async (req: Request, res: Response) => {
  try {
    const { warehouse_id } = req.query;
    let data;
    if (warehouse_id) {
      data = await areaService.getAreasByWarehouse(warehouse_id as string);
    } else {
      data = await areaService.getAllAreas();
    }
    res.status(200).json(data);
  } catch (error) {
    handleError(res, error);
  }
};

export const createArea = async (req: Request, res: Response) => {
  try {
    const area = await areaService.createArea(req.body);
    res.status(201).json(area);
  } catch (error) {
    handleError(res, error);
  }
};

export const updateArea = async (req: Request, res: Response) => {
  try {
    const area = await areaService.updateArea(req.params.id, req.body);
    res.status(200).json(area);
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteArea = async (req: Request, res: Response) => {
  try {
    await areaService.deleteArea(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, error);
  }
};
