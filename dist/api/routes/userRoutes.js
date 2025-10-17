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
// backend/src/api/routes/userRoutes.ts
const express_1 = require("express");
const userController = __importStar(require("../controllers/userController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Middleware baru yang lebih ketat, hanya untuk super_admin
const superAdminOnly = (0, authMiddleware_1.roleBasedAuth)(["super_admin"]);
// Terapkan middleware superAdminOnly ke semua rute manajemen pengguna
router.get("/", authMiddleware_1.authMiddleware, superAdminOnly, userController.listUsers);
router.post("/invite", authMiddleware_1.authMiddleware, superAdminOnly, userController.inviteUser);
router.delete("/:id", authMiddleware_1.authMiddleware, superAdminOnly, userController.deleteUser);
// Rute BARU untuk mengubah peran dan status
router.put("/:id/role", authMiddleware_1.authMiddleware, superAdminOnly, userController.updateUserRole);
router.put("/:id/status", authMiddleware_1.authMiddleware, superAdminOnly, userController.updateUserStatus);
// Rute /me untuk pengguna biasa tetap ada dan tidak berubah
router.get("/me", authMiddleware_1.authMiddleware, userController.getMyProfile);
router.put("/me", authMiddleware_1.authMiddleware, userController.updateMyProfile);
router.get("/me/preferences", authMiddleware_1.authMiddleware, userController.getMyPreferences);
router.put("/me/preferences", authMiddleware_1.authMiddleware, userController.updateMyPreferences);
exports.default = router;
