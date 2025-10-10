// backend/src/api/routes/userRoutes.ts
import { Router } from "express";
import * as userController from "../controllers/userController";
import { authMiddleware, roleBasedAuth } from "../middlewares/authMiddleware";

const router = Router();
// Middleware baru yang lebih ketat, hanya untuk super_admin
const superAdminOnly = roleBasedAuth(["super_admin"]);

// Terapkan middleware superAdminOnly ke semua rute manajemen pengguna
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

// Rute BARU untuk mengubah peran dan status
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

// Rute /me untuk pengguna biasa tetap ada dan tidak berubah
router.get("/me", authMiddleware, userController.getMyProfile);
router.put("/me", authMiddleware, userController.updateMyProfile);

export default router;
