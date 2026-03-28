// backend/src/api/middlewares/validateRequest.ts

import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (e: any) {
      // Mengirim response dengan format yang lebih bersih
      return res.status(400).json({
        message: "Invalid request data",
        errors: e.flatten().fieldErrors,
      });
    }
  };
