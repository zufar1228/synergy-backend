/**
 * @file userService.ts
 * @purpose User lifecycle management — auth verification, invite, profile, roles, preferences
 * @usedBy userController
 * @deps supabaseAdmin, env, notificationService, db/drizzle, schema (profiles, user_roles, user_notification_preferences)
 * @exports verifyUserAccess, inviteUser, getAllUsers, deleteUser, getUserProfile, updateUserRole, updateUserStatus, updateUserProfile, getUserPreferences, updateUserPreferences, syncAllRolesToSupabase
 * @sideEffects DB read/write, Supabase Auth API, email sending
 */

import { supabaseAdmin } from '../config/supabaseAdmin';
import { env } from '../config/env';
import { sendInviteEmail } from './notificationService';
import { db } from '../db/drizzle';
import {
  profiles,
  user_roles,
  user_notification_preferences
} from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import ApiError from '../utils/apiError';
import { User } from '@supabase/supabase-js';
import * as telegramService from './telegramService';

export const verifyUserAccess = async (
  userId: string
): Promise<{ authorized: boolean; message: string }> => {
  const userRole = await db.query.user_roles.findFirst({
    where: eq(user_roles.user_id, userId)
  });

  if (!userRole) {
    console.log(
      `[verifyUserAccess] User ${userId} not found in user_roles table. Deleting unauthorized user.`
    );
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.log(
        `[verifyUserAccess] Successfully deleted unauthorized user ${userId}`
      );
    } catch (deleteError) {
      console.error(
        `[verifyUserAccess] Failed to delete unauthorized user ${userId}:`,
        deleteError
      );
    }
    return {
      authorized: false,
      message:
        'Anda tidak memiliki akses. Silakan hubungi administrator untuk mendapatkan undangan.'
    };
  }

  return { authorized: true, message: 'User authorized' };
};

const touchSecurityTimestamp = async (userId: string) => {
  await db
    .update(profiles)
    .set({ security_timestamp: new Date(), updated_at: new Date() })
    .where(eq(profiles.id, userId));
};

export const inviteUser = async (
  email: string,
  role: 'admin' | 'user' | 'super_admin'
) => {
  const { data, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: email,
      options: { redirectTo: env.FRONTEND_URL + '/setup-account' }
    });

  if (linkError) {
    if (linkError.message.includes('already been registered')) {
      throw new ApiError(409, 'Pengguna dengan email ini sudah terdaftar.');
    }
    throw new ApiError(400, linkError.message);
  }

  const invitedUser = data.user;
  const inviteLink = data.properties.action_link;

  try {
    // Upsert user role (insert or update on conflict)
    await db
      .insert(user_roles)
      .values({ user_id: invitedUser.id, role })
      .onConflictDoUpdate({
        target: user_roles.user_id,
        set: { role }
      });

    // Sync role to Supabase app_metadata
    await supabaseAdmin.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: { role }
    });
  } catch (dbError) {
    console.error('!!! DEBUG: Database error while saving user role:', dbError);
    await supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
    throw new ApiError(500, 'Gagal menyimpan peran pengguna.');
  }

  await sendInviteEmail({ to: email, inviteLink: inviteLink });
  return invitedUser;
};

export const getAllUsers = async (requestingUserId: string) => {
  const {
    data: { users },
    error
  } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new ApiError(500, 'Gagal mengambil daftar pengguna.');

  const roles = await db.query.user_roles.findMany();
  const rolesMap = new Map(roles.map((r) => [r.user_id, r.role]));

  const userIds = users.map((u: User) => u.id);
  const allProfiles = await db.query.profiles.findMany({
    where: inArray(profiles.id, userIds)
  });
  const profileMap = new Map(allProfiles.map((p) => [p.id, p]));

  const usersWithRolesAndProfiles = users.map((user: User) => {
    const role = rolesMap.get(user.id) || 'user';
    const profile = profileMap.get(user.id);

    return {
      ...user,
      role,
      username: profile?.username,
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
      full_name: user.user_metadata?.full_name
    };
  });

  return usersWithRolesAndProfiles.filter(
    (user: User & { role: string }) =>
      user.role !== 'super_admin' && user.id !== requestingUserId
  );
};

export const deleteUser = async (userId: string) => {
  const targetRole = await db.query.user_roles.findFirst({
    where: eq(user_roles.user_id, userId)
  });
  if (targetRole?.role === 'super_admin') {
    throw new ApiError(403, 'Tidak dapat menghapus akun super_admin.');
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId)
  });

  if (profile?.telegram_user_id) {
    console.log(
      `[AutoKick] Attempting to kick Telegram user: ${profile.telegram_user_id}`
    );
    telegramService
      .kickMember(profile.telegram_user_id)
      .then((success) => {
        if (success) {
          console.log(
            `[AutoKick] Successfully kicked Telegram user: ${profile.telegram_user_id}`
          );
        } else {
          console.log(
            `[AutoKick] Failed to kick Telegram user: ${profile.telegram_user_id}`
          );
        }
      })
      .catch((err) => console.error('[AutoKick] Error:', err));
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error)
    throw new ApiError(500, `Gagal menghapus pengguna: ${error.message}`);
};

export const getUserProfile = async (userId: string) => {
  let profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId)
  });

  if (!profile) {
    const {
      data: { user }
    } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    const defaultUsername =
      user.email?.split('@')[0] || `user-${userId.substring(0, 8)}`;

    const [created] = await db
      .insert(profiles)
      .values({
        id: userId,
        username: defaultUsername,
        security_timestamp: new Date()
      })
      .returning();
    profile = created;
  }

  const {
    data: { user: authUser },
    error: authError
  } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (authError) {
    console.error('Error fetching auth user data:', authError);
  }

  const userRole = await db.query.user_roles.findFirst({
    where: eq(user_roles.user_id, userId)
  });

  return {
    ...profile,
    email: authUser?.email,
    role: userRole?.role || 'user',
    avatar_url:
      authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture,
    full_name: authUser?.user_metadata?.full_name
  };
};

export const updateUserRole = async (
  userId: string,
  newRole: 'admin' | 'user' | 'super_admin'
) => {
  const targetUserRole = await db.query.user_roles.findFirst({
    where: eq(user_roles.user_id, userId)
  });
  if (targetUserRole && targetUserRole.role === 'super_admin') {
    throw new ApiError(403, 'Tidak dapat mengubah peran super_admin.');
  }

  const [role] = await db
    .insert(user_roles)
    .values({ user_id: userId, role: newRole })
    .onConflictDoUpdate({
      target: user_roles.user_id,
      set: { role: newRole }
    })
    .returning();

  await touchSecurityTimestamp(userId);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { role: newRole }
  });

  return role;
};

export const updateUserStatus = async (
  userId: string,
  status: 'active' | 'inactive'
) => {
  const ban_duration = status === 'inactive' ? '876000h' : '0s';

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { ban_duration }
  );

  await touchSecurityTimestamp(userId);

  if (error) {
    throw new ApiError(500, `Gagal mengubah status pengguna: ${error.message}`);
  }
  if (!data || !data.user) {
    throw new ApiError(
      404,
      'Pengguna tidak ditemukan saat mencoba mengubah status.'
    );
  }

  return data.user;
};

export const updateUserProfile = async (
  userId: string,
  data: { username: string }
) => {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId)
  });
  if (!profile) throw new ApiError(404, 'Profil tidak ditemukan.');

  const [updated] = await db
    .update(profiles)
    .set({
      ...data,
      security_timestamp: new Date(),
      updated_at: new Date()
    })
    .where(eq(profiles.id, userId))
    .returning();
  return updated;
};

export const getUserPreferences = async (userId: string) => {
  return await db.query.user_notification_preferences.findMany({
    where: eq(user_notification_preferences.user_id, userId),
    columns: { system_type: true, is_enabled: true }
  });
};

export const syncAllRolesToSupabase = async () => {
  const roles = await db.query.user_roles.findMany();
  const results = { success: 0, failed: 0, details: [] as any[] };

  for (const role of roles) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(role.user_id, {
        app_metadata: { role: role.role }
      });
      results.success++;
      results.details.push({
        user_id: role.user_id,
        role: role.role,
        status: 'synced'
      });
    } catch (error: any) {
      results.failed++;
      results.details.push({
        user_id: role.user_id,
        role: role.role,
        status: 'failed',
        error: error.message
      });
    }
  }

  return results;
};

export const updateUserPreferences = async (
  userId: string,
  preferences: { system_type: string; is_enabled: boolean }[]
) => {
  try {
    // Batch strategy: DELETE existing + INSERT all in one transaction.
    // Reduces O(2N) round-trips (per-item SELECT + UPDATE/INSERT) to O(2).
    // Safe because transaction guarantees atomicity — no partial state.
    await db.transaction(async (tx) => {
      // 1. Delete all existing preferences for this user (single DELETE)
      await tx
        .delete(user_notification_preferences)
        .where(eq(user_notification_preferences.user_id, userId));

      // 2. Batch insert all preferences (single INSERT with multiple values)
      if (preferences.length > 0) {
        await tx.insert(user_notification_preferences).values(
          preferences.map((pref) => ({
            user_id: userId,
            system_type: pref.system_type,
            is_enabled: pref.is_enabled
          }))
        );
      }
    });

    return getUserPreferences(userId);
  } catch (error) {
    console.error('[UserService] Failed to update preferences:', error);
    throw new ApiError(500, 'Gagal menyimpan preferensi.');
  }
};

