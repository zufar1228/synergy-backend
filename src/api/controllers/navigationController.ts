// backend/src/api/controllers/navigationController.ts
import { Request, Response } from "express";
import * as navigationService from "../../services/navigationService";
import ApiError from "../../utils/apiError";

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  return res.status(500).json({ message: "An unexpected error occurred." });
};

export const listAreasBySystem = async (req: Request, res: Response) => {
  try {
    const { system_type } = req.query;
    if (!system_type) {
      return res
        .status(400)
        .json({ message: 'Query parameter "system_type" is required.' });
    }
    const data = await navigationService.getAreasBySystemType(
      system_type as string
    );
    res.status(200).json(data);
  } catch (error) {
    handleError(res, error);
  }
};
