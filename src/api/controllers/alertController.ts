// backend/src/api/controllers/alertController.ts
import { Request, Response } from "express";
import * as alertService from "../../services/alertService";

export const listActiveAlerts = async (req: Request, res: Response) => {
  try {
    const { warehouse_id } = req.query;
    if (!warehouse_id) {
      return res
        .status(400)
        .json({ message: 'Query "warehouse_id" is required.' });
    }
    const data = await alertService.getActiveAlerts(warehouse_id as string);
    res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("Failed to list active alerts:", error);
    res.status(500).json({ message });
  }
};
