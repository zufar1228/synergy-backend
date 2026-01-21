// backend/src/api/controllers/userController.ts
import { Request, Response } from "express";
import * as userService from "../../services/userService";
import * as webPushService from "../../services/webPushService";
import ApiError from "../../utils/apiError";

/**
 * Verify if the current user is authorized to access the system.
 * Users must be invited through user management or manually added to Supabase.
 * If not authorized, the user will be deleted from Supabase Auth.
 */
export const verifyAccess = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ authorized: false, message: "User not authenticated" });
    }
    
    const result = await userService.verifyUserAccess(userId);
    
    if (!result.authorized) {
      return res.status(403).json(result);
    }
    
    res.status(200).json(result);
  } catch (error) {
    console.error("[verifyAccess] Error:", error);
    res.status(500).json({ authorized: false, message: "Terjadi kesalahan saat memverifikasi akses." });
  }
};

export const inviteUser = async (req: Request, res: Response) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ message: "Email dan role wajib diisi." });
  }
  try {
    const user = await userService.inviteUser(email, role);
    res.status(200).json({ message: "Undangan berhasil dikirim.", user });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: "Terjadi kesalahan tak terduga." });
  }
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.user!.id; // Dapatkan ID super_admin yang membuat request
    const users = await userService.getAllUsers(requestingUserId);
    res.status(200).json(users);
  } catch (error) {
    handleError(res, error);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    await userService.deleteUser(req.params.id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: "Terjadi kesalahan tak terduga." });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    // Ambil user ID dari middleware, bukan dari parameter URL
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, "User not authenticated");

    console.log(`[getMyProfile] Fetching profile for user: ${userId}`);
    const profile = await userService.getUserProfile(userId);
    console.log(`[getMyProfile] Profile found:`, JSON.stringify(profile, null, 2));
    
    res.status(200).json(profile);
  } catch (error) {
    console.error(`[getMyProfile] Error:`, error);
    handleError(res, error);
  }
};

export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, "User not authenticated");
    const { username } = req.body;
    if (!username)
      return res.status(400).json({ message: "Username is required." });
    const profile = await userService.updateUserProfile(userId, { username });
    res.status(200).json(profile);
  } catch (error) {
    handleError(res, error);
  }
};

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  // Log error yang tidak terduga untuk debugging
  console.error("Unhandled Error in UserController:", error);
  return res
    .status(500)
    .json({ message: "An unexpected internal server error occurred." });
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role || !["admin", "user", "super_admin"].includes(role)) {
      return res.status(400).json({ message: "Peran tidak valid." });
    }
    const updatedRole = await userService.updateUserRole(id, role);
    res.status(200).json(updatedRole);
  } catch (error) {
    handleError(res, error);
  }
};

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }
    const updatedUser = await userService.updateUserStatus(id, status);
    res.status(200).json(updatedUser);
  } catch (error) {
    handleError(res, error);
  }
};

export const validateSession = (req: Request, res: Response) => {
  // Jika middleware berhasil dilewati, berarti token valid.
  // Cukup kirim respons sukses.
  res.status(200).json({ valid: true });
};

export const getMyPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = await userService.getUserPreferences(userId);
    res.status(200).json(preferences);
  } catch (error) {
    handleError(res, error);
  }
};

// Handler BARU
export const updateMyPreferences = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = req.body; // Harapannya adalah array of objects
    if (!Array.isArray(preferences)) {
      return res
        .status(400)
        .json({ message: "Request body harus berupa array." });
    }
    const updatedPreferences = await userService.updateUserPreferences(
      userId,
      preferences
    );
    res.status(200).json(updatedPreferences);
  } catch (error) {
    handleError(res, error);
  }
};

export const subscribeToPush = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscription = req.body; // Objek PushSubscription dari browser
    console.log(`[Push] Saving subscription for user ${userId}:`, JSON.stringify(subscription).slice(0, 100) + '...');
    await webPushService.saveSubscription(userId, subscription);
    res.status(201).json({ message: "Push subscription saved." });
  } catch (error) {
    handleError(res, error);
  }
};

export const getVapidPublicKey = (req: Request, res: Response) => {
  res.status(200).json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
};

// Sync all roles from database to Supabase app_metadata
export const syncAllRoles = async (req: Request, res: Response) => {
  try {
    console.log(`[syncAllRoles] Starting sync by user ${req.user?.id}`);
    const result = await userService.syncAllRolesToSupabase();
    console.log(`[syncAllRoles] Sync complete:`, result);
    res.status(200).json({ message: 'Roles synced successfully', ...result });
  } catch (error) {
    handleError(res, error);
  }
};

// TEST ENDPOINT: Manually trigger a push notification to the current user
export const testPushNotification = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`[Push Test] Triggering test notification for user ${userId}`);
    
    await webPushService.sendPushNotification(userId, {
      title: "🧪 Test Notification",
      body: "Jika Anda melihat ini, push notification bekerja!",
      url: "/dashboard",
    });
    
    res.status(200).json({ message: "Test push notification sent. Check your device." });
  } catch (error) {
    console.error("[Push Test] Error:", error);
    handleError(res, error);
  }
};
