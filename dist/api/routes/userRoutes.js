"use strict";
/**
 * @file userRoutes.ts
 * @purpose Express router for user management, profile, and push notification endpoints
 * @usedBy server.ts
 * @deps userController, profileController, pushController, authMiddleware
 * @exports default router
 * @sideEffects None
 */
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
const userController = __importStar(require("../controllers/userController"));
const profileController = __importStar(require("../controllers/profileController"));
const pushController = __importStar(require("../controllers/pushController"));
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
// Middleware baru yang lebih ketat, hanya untuk super_admin
const superAdminOnly = (0, authMiddleware_1.roleBasedAuth)(["super_admin"]);
// ============================================================================
// ADMIN MANAGEMENT — super_admin only
// ============================================================================
router.get("/", authMiddleware_1.authMiddleware, superAdminOnly, userController.listUsers);
router.post("/invite", authMiddleware_1.authMiddleware, superAdminOnly, userController.inviteUser);
router.delete("/:id", authMiddleware_1.authMiddleware, superAdminOnly, userController.deleteUser);
router.put("/:id/role", authMiddleware_1.authMiddleware, superAdminOnly, userController.updateUserRole);
router.put("/:id/status", authMiddleware_1.authMiddleware, superAdminOnly, userController.updateUserStatus);
// Sync all roles to Supabase (super_admin only)
router.post("/sync-roles", authMiddleware_1.authMiddleware, superAdminOnly, userController.syncAllRoles);
// ============================================================================
// PROFILE & PREFERENCES — authenticated users
// ============================================================================
router.get("/verify-access", authMiddleware_1.authMiddleware, profileController.verifyAccess);
router.get("/me", authMiddleware_1.authMiddleware, profileController.getMyProfile);
router.put("/me", authMiddleware_1.authMiddleware, profileController.updateMyProfile);
router.get("/me/preferences", authMiddleware_1.authMiddleware, profileController.getMyPreferences);
router.put("/me/preferences", authMiddleware_1.authMiddleware, profileController.updateMyPreferences);
// ============================================================================
// PUSH NOTIFICATIONS — authenticated users
// ============================================================================
router.get("/push/vapid-key", authMiddleware_1.authMiddleware, pushController.getVapidPublicKey);
router.post("/push/subscribe", authMiddleware_1.authMiddleware, pushController.subscribeToPush);
router.post("/push/test", authMiddleware_1.authMiddleware, pushController.testPushNotification);
exports.default = router;
