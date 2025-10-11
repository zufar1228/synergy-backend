// backend/src/api/controllers/warehouseController.ts

import { Request, Response } from "express";
import * as warehouseService from "../../services/warehouseService";
import ApiError from "../../utils/apiError";
import { Warehouse } from "../../db/models";

export const getAreasWithSystems = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await warehouseService.getWarehouseWithAreaSystems(id);
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};

export const listWarehouses = async (req: Request, res: Response) => {
  try {
    // Panggil fungsi baru yang mengembalikan statistik
    const data = await warehouseService.getAllWarehousesWithStats();
    res.status(200).json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};

export const createWarehouse = async (req: Request, res: Response) => {
  try {
    const warehouse = await warehouseService.createWarehouse(req.body);
    res.status(201).json(warehouse);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};

export const getWarehouseById = async (req: Request, res: Response) => {
  try {
    // Fungsi findByPk sudah ada di service (getWarehouseWithAreaSystems),
    // tapi kita buat yang lebih simpel di sini
    const warehouse = await Warehouse.findByPk(req.params.id);
    if (!warehouse)
      return res.status(404).json({ message: "Warehouse not found" });
    res.status(200).json(warehouse);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};

export const updateWarehouse = async (req: Request, res: Response) => {
  try {
    const warehouse = await warehouseService.updateWarehouse(
      req.params.id,
      req.body
    );
    res.status(200).json(warehouse);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};

export const deleteWarehouse = async (req: Request, res: Response) => {
  try {
    await warehouseService.deleteWarehouse(req.params.id);
    res.status(204).send(); // No Content
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res
      .status(500)
      .json({ message: "An unexpected server error occurred." });
  }
};
