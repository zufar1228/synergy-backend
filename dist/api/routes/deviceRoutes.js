"use strict";
// backend/src/api/routes/deviceRoutes.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const deviceController = __importStar(require("../controllers/deviceController"));
const validateRequest_1 = require("../middlewares/validateRequest");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const adminOnly = (0, authMiddleware_1.roleBasedAuth)(['admin', 'super_admin']);
// Daftar tipe sistem yang kita izinkan
const systemTypes = zod_1.z.enum(['keamanan', 'intrusi', 'lingkungan']);
const createDeviceSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, { message: 'Nama wajib diisi.' }),
        area_id: zod_1.z
            .string()
            .uuid({ message: 'Area ID harus berupa UUID yang valid.' }),
        system_type: systemTypes // <-- PERUBAHAN DI SINI
    })
});
const updateDeviceSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        area_id: zod_1.z.string().uuid().optional()
        // Tipe sistem tidak boleh diubah saat update, jadi kita hapus dari skema update
    })
});
// Daftarkan semua endpoint
// Rute ini harus di atas rute '/:id' agar 'details' tidak dianggap sebagai ID
router.get('/details', deviceController.getDeviceDetailsByArea);
// Rute yang sudah ada
router.get('/', deviceController.listDevices);
router.post('/', adminOnly, (0, validateRequest_1.validate)(createDeviceSchema), deviceController.createDevice);
router.get('/:id', deviceController.getDeviceById);
router.put('/:id', adminOnly, (0, validateRequest_1.validate)(updateDeviceSchema), deviceController.updateDevice);
router.delete('/:id', adminOnly, deviceController.deleteDevice);
exports.default = router;
