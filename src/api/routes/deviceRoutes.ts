// backend/src/api/routes/deviceRoutes.ts

import { Router } from "express";
import * as deviceController from "../controllers/deviceController";
import { validate } from "../middlewares/validateRequest";
import { z } from "zod";

const router = Router();

// Skema Zod untuk validasi
const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "Nama wajib diisi." }),
    area_id: z
      .string()
      .uuid({ message: "Area ID harus berupa UUID yang valid." }),
    system_type: z.string().min(1, { message: "Tipe sistem wajib diisi." }),
  }),
});

// Skema untuk update, semua field bersifat opsional
const updateDeviceSchema = z.object({
  body: createDeviceSchema.shape.body.partial(),
});

// Daftarkan semua endpoint
router.get("/", deviceController.listDevices);
router.post("/", validate(createDeviceSchema), deviceController.createDevice);
router.get("/:id", deviceController.getDeviceById);
router.put("/:id", validate(updateDeviceSchema), deviceController.updateDevice);
router.delete("/:id", deviceController.deleteDevice);

export default router;
