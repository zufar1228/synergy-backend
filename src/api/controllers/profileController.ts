/**
 * @file profileController.ts
 * @purpose HTTP handlers for user profile, preferences, and access verification
 * @usedBy userRoutes.ts
 * @deps userService, ApiError
 * @exports verifyAccess, getMyProfile, updateMyProfile, getMyPreferences, updateMyPreferences
 * @sideEffects DB read/write (profiles, user_notification_preferences), Supabase Auth API
 */

import { Request, Response } from 'express';
import * as userService from '../../services/userService';
import ApiError from '../../utils/apiError';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error('Unhandled Error in ProfileController:', error);
  return res
    .status(500)
    .json({ message: 'An unexpected internal server error occurred.' });
};

/**
 * Verify if the current user is authorized to access the system.
 * Users must be invited through user management or manually added to Supabase.
 * If not authorized, the user will be deleted from Supabase Auth.
 */
export const verifyAccess = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ authorized: false, message: 'User not authenticated' });
    }

    const result = await userService.verifyUserAccess(userId);

    if (!result.authorized) {
      return res.status(403).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[verifyAccess] Error:', error);
    res.status(500).json({
      authorized: false,
      message: 'Terjadi kesalahan saat memverifikasi akses.'
    });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'User not authenticated');

    console.log(`[getMyProfile] Fetching profile for user: ${userId}`);
    const profile = await userService.getUserProfile(userId);
    console.log(
      `[getMyProfile] Profile found:`,
      JSON.stringify(profile, null, 2)
    );

    res.status(200).json(profile);
  } catch (error) {
    console.error(`[getMyProfile] Error:`, error);
    handleError(res, error);
  }
};

export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'User not authenticated');
    const { username } = req.body;
    if (!username)
      return res.status(400).json({ message: 'Username is required.' });
    const profile = await userService.updateUserProfile(userId, { username });
    res.status(200).json(profile);
  } catch (error) {
    handleError(res, error);
  }
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
        .json({ message: 'Request body harus berupa array.' });
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
