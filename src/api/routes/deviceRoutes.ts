// backend/src/api/routes/deviceRoutes.ts

import { Router } from "express";
import * as deviceController from "../controllers/deviceController";
import { validate } from "../middlewares/validateRequest";
import { z } from "zod";

const router = Router();

// Daftar tipe sistem yang kita izinkan
const systemTypes = z.enum(["lingkungan", "gangguan", "keamanan", "medis_air"]);

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1, { message: "Nama wajib diisi." }),
    area_id: z
      .string()
      .uuid({ message: "Area ID harus berupa UUID yang valid." }),
    system_type: systemTypes, // <-- PERUBAHAN DI SINI
  }),
});

const updateDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    area_id: z.string().uuid().optional(),
    // Tipe sistem tidak boleh diubah saat update, jadi kita hapus dari skema update
  }),
});

// Tambahkan schema untuk manual command
const manualCommandSchema = z.object({
  body: z.object({
    action: z.enum(["On", "Off"], {
      message: 'Aksi harus "On" atau "Off"',
    }),
  }),
});

// Daftarkan semua endpoint

// --- TAMBAHKAN RUTE BARU INI ---
// Rute ini harus di atas rute '/:id' agar 'details' tidak dianggap sebagai ID
router.get("/details", deviceController.getDeviceDetailsByArea);

// Rute BARU untuk perintah manual
router.post(
  "/:id/command",
  validate(manualCommandSchema), // ✅ Tambahkan ini
  deviceController.sendManualCommand
);
// ---------------------------------

// Rute yang sudah ada
router.get("/", deviceController.listDevices);
router.post("/", validate(createDeviceSchema), deviceController.createDevice);
router.get("/:id", deviceController.getDeviceById);
router.put("/:id", validate(updateDeviceSchema), deviceController.updateDevice);
router.delete("/:id", deviceController.deleteDevice);

export default router;
