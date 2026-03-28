"use strict";
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
// backend/src/api/routes/areaRoutes.ts
const express_1 = require("express");
const zod_1 = require("zod");
const areaController = __importStar(require("../controllers/areaController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const validateRequest_1 = require("../middlewares/validateRequest");
const router = (0, express_1.Router)();
const adminOnly = (0, authMiddleware_1.roleBasedAuth)(['admin', 'super_admin']);
const createAreaSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, { message: 'Nama area wajib diisi.' }),
        warehouse_id: zod_1.z.string().uuid({ message: 'Warehouse ID harus berupa UUID yang valid.' }),
    }),
});
const updateAreaSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1, { message: 'Nama area wajib diisi.' }).optional(),
    }),
    params: zod_1.z.object({
        id: zod_1.z.string().uuid({ message: 'ID harus berupa UUID yang valid.' }),
    }),
});
router.get('/', areaController.listAreas);
router.post('/', adminOnly, (0, validateRequest_1.validate)(createAreaSchema), areaController.createArea);
router.put('/:id', adminOnly, (0, validateRequest_1.validate)(updateAreaSchema), areaController.updateArea);
router.delete('/:id', adminOnly, areaController.deleteArea);
exports.default = router;
