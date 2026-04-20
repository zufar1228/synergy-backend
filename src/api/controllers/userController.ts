/**
 * @file userController.ts
 * @purpose HTTP handlers for user admin management (list, invite, delete, role, status, sync)
 * @usedBy userRoutes.ts
 * @deps userService, ApiError
 * @exports inviteUser, listUsers, deleteUser, updateUserRole, updateUserStatus, syncAllRoles
 * @sideEffects DB read/write (user_roles, profiles), Supabase Auth API, Resend email
 */

import { Request, Response } from 'express';
import * as userService from '../../services/userService';
import ApiError from '../../utils/apiError';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error('Unhandled Error in UserController:', error);
  return res
    .status(500)
    .json({ message: 'An unexpected internal server error occurred.' });
};

export const inviteUser = async (req: Request, res: Response) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ message: 'Email dan role wajib diisi.' });
  }
  const validRoles = ['admin', 'user'];
  if (!validRoles.includes(role)) {
    return res
      .status(400)
      .json({ message: 'Peran tidak valid. Harus admin atau user.' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Format email tidak valid.' });
  }
  try {
    const user = await userService.inviteUser(email, role);
    res.status(201).json({ message: 'Undangan berhasil dikirim.', user });
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: 'Terjadi kesalahan tak terduga.' });
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
    res.status(500).json({ message: 'Terjadi kesalahan tak terduga.' });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!role || !['admin', 'user', 'super_admin'].includes(role)) {
      return res.status(400).json({ message: 'Peran tidak valid.' });
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
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status tidak valid.' });
    }
    const updatedUser = await userService.updateUserStatus(id, status);
    res.status(200).json(updatedUser);
  } catch (error) {
    handleError(res, error);
  }
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
