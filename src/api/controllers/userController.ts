// backend/src/api/controllers/userController.ts
import { Request, Response } from "express";
import * as userService from "../../services/userService";
import ApiError from "../../utils/apiError";

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

    const profile = await userService.getUserProfile(userId);
    res.status(200).json(profile);
  } catch (error) {
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
    if (!role || !["admin", "user"].includes(role)) {
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
