/**
 * @file userRoutes.ts
 * @purpose Express router for user management, profile, and push notification endpoints
 * @usedBy server.ts
 * @deps userController, profileController, pushController, authMiddleware
 * @exports default router
 * @sideEffects None
 */

import { Router } from "express";
import * as userController from "../controllers/userController";
import * as profileController from "../controllers/profileController";
import * as pushController from "../controllers/pushController";
import { authMiddleware, roleBasedAuth } from "../middlewares/authMiddleware";

const router = Router();
// Middleware baru yang lebih ketat, hanya untuk super_admin
const superAdminOnly = roleBasedAuth(["super_admin"]);

// ============================================================================
// ADMIN MANAGEMENT — super_admin only
// ============================================================================
router.get("/", authMiddleware, superAdminOnly, userController.listUsers);
router.post(
  "/invite",
  authMiddleware,
  superAdminOnly,
  userController.inviteUser
);
router.delete(
  "/:id",
  authMiddleware,
  superAdminOnly,
  userController.deleteUser
);
router.put(
  "/:id/role",
  authMiddleware,
  superAdminOnly,
  userController.updateUserRole
);
router.put(
  "/:id/status",
  authMiddleware,
  superAdminOnly,
  userController.updateUserStatus
);
// Sync all roles to Supabase (super_admin only)
router.post("/sync-roles", authMiddleware, superAdminOnly, userController.syncAllRoles);

// ============================================================================
// PROFILE & PREFERENCES — authenticated users
// ============================================================================
router.get("/verify-access", authMiddleware, profileController.verifyAccess);
router.get("/me", authMiddleware, profileController.getMyProfile);
router.put("/me", authMiddleware, profileController.updateMyProfile);
router.get("/me/preferences", authMiddleware, profileController.getMyPreferences);
router.put("/me/preferences", authMiddleware, profileController.updateMyPreferences);

// ============================================================================
// PUSH NOTIFICATIONS — authenticated users
// ============================================================================
router.get("/push/vapid-key", authMiddleware, pushController.getVapidPublicKey);
router.post("/push/subscribe", authMiddleware, pushController.subscribeToPush);
router.post("/push/test", authMiddleware, pushController.testPushNotification);

export default router;
