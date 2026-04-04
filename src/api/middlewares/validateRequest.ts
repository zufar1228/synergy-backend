// backend/src/api/middlewares/validateRequest.ts

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params
      }) as { body?: any; query?: any; params?: any };
      // Assign parsed values back so unknown keys are stripped
      if (parsed.body) req.body = parsed.body;
      if (parsed.query) req.query = parsed.query;
      if (parsed.params) req.params = parsed.params;
      next();
    } catch (e: any) {
      // Mengirim response dengan format yang lebih bersih
      return res.status(400).json({
        message: 'Invalid request data',
        errors: e.flatten().fieldErrors
      });
    }
  };
