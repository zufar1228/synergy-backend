"use strict";
// backend/src/api/middlewares/validateRequest.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = exports.createDeviceSchema = void 0;
const zod_1 = require("zod");
exports.createDeviceSchema = zod_1.z.object({
    body: zod_1.z.object({
        // PERUBAHAN DI SINI: Gunakan .min(1) untuk memastikan string tidak kosong
        name: zod_1.z
            .string()
            .min(1, { message: "Name is required and cannot be empty." }),
        // PERUBAHAN DI SINI: Cukup validasi sebagai UUID. Zod akan otomatis
        // menangani jika field ini tidak ada.
        area_id: zod_1.z.string().uuid({ message: "Area ID must be a valid UUID." }),
        // PERUBAHAN DI SINI: Sama seperti 'name'
        system_type: zod_1.z
            .string()
            .min(1, { message: "System type is required and cannot be empty." }),
    }),
});
const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    }
    catch (e) {
        // Mengirim response dengan format yang lebih bersih
        return res.status(400).json({
            message: "Invalid request data",
            errors: e.flatten().fieldErrors,
        });
    }
};
exports.validate = validate;
