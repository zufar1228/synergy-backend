// backend/src/api/middlewares/validateRequest.ts

import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export const createDeviceSchema = z.object({
  body: z.object({
    // PERUBAHAN DI SINI: Gunakan .min(1) untuk memastikan string tidak kosong
    name: z
      .string()
      .min(1, { message: "Name is required and cannot be empty." }),

    // PERUBAHAN DI SINI: Cukup validasi sebagai UUID. Zod akan otomatis
    // menangani jika field ini tidak ada.
    area_id: z.string().uuid({ message: "Area ID must be a valid UUID." }),

    // PERUBAHAN DI SINI: Sama seperti 'name'
    system_type: z
      .string()
      .min(1, { message: "System type is required and cannot be empty." }),
  }),
});

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
