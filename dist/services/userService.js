"use strict";
/**
 * @file userService.ts
 * @purpose User lifecycle management — auth verification, invite, profile, roles, preferences
 * @usedBy userController
 * @deps supabaseAdmin, env, notificationService, db/drizzle, schema (profiles, user_roles, user_notification_preferences)
 * @exports verifyUserAccess, inviteUser, getAllUsers, deleteUser, getUserProfile, updateUserRole, updateUserStatus, updateUserProfile, getUserPreferences, updateUserPreferences, syncAllRolesToSupabase
 * @sideEffects DB read/write, Supabase Auth API, email sending
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPreferences = exports.syncAllRolesToSupabase = exports.getUserPreferences = exports.updateUserProfile = exports.updateUserStatus = exports.updateUserRole = exports.getUserProfile = exports.deleteUser = exports.getAllUsers = exports.inviteUser = exports.verifyUserAccess = void 0;
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const env_1 = require("../config/env");
const notificationService_1 = require("./notificationService");
const drizzle_1 = require("../db/drizzle");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const apiError_1 = __importDefault(require("../utils/apiError"));
const telegramService = __importStar(require("./telegramService"));
const verifyUserAccess = async (userId) => {
    const userRole = await drizzle_1.db.query.user_roles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.user_roles.user_id, userId)
    });
    if (!userRole) {
        console.log(`[verifyUserAccess] User ${userId} not found in user_roles table. Deleting unauthorized user.`);
        try {
            await supabaseAdmin_1.supabaseAdmin.auth.admin.deleteUser(userId);
            console.log(`[verifyUserAccess] Successfully deleted unauthorized user ${userId}`);
        }
        catch (deleteError) {
            console.error(`[verifyUserAccess] Failed to delete unauthorized user ${userId}:`, deleteError);
        }
        return {
            authorized: false,
            message: 'Anda tidak memiliki akses. Silakan hubungi administrator untuk mendapatkan undangan.'
        };
    }
    return { authorized: true, message: 'User authorized' };
};
exports.verifyUserAccess = verifyUserAccess;
const touchSecurityTimestamp = async (userId) => {
    await drizzle_1.db
        .update(schema_1.profiles)
        .set({ security_timestamp: new Date(), updated_at: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.profiles.id, userId));
};
const inviteUser = async (email, role) => {
    const { data, error: linkError } = await supabaseAdmin_1.supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: { redirectTo: env_1.env.FRONTEND_URL + '/setup-account' }
    });
    if (linkError) {
        if (linkError.message.includes('already been registered')) {
            throw new apiError_1.default(409, 'Pengguna dengan email ini sudah terdaftar.');
        }
        throw new apiError_1.default(400, linkError.message);
    }
    const invitedUser = data.user;
    const inviteLink = data.properties.action_link;
    try {
        // Upsert user role (insert or update on conflict)
        await drizzle_1.db
            .insert(schema_1.user_roles)
            .values({ user_id: invitedUser.id, role })
            .onConflictDoUpdate({
            target: schema_1.user_roles.user_id,
            set: { role }
        });
        // Sync role to Supabase app_metadata
        await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(invitedUser.id, {
            app_metadata: { role }
        });
    }
    catch (dbError) {
        console.error('!!! DEBUG: Database error while saving user role:', dbError);
        await supabaseAdmin_1.supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
        throw new apiError_1.default(500, 'Gagal menyimpan peran pengguna.');
    }
    await (0, notificationService_1.sendInviteEmail)({ to: email, inviteLink: inviteLink });
    return invitedUser;
};
exports.inviteUser = inviteUser;
const getAllUsers = async (requestingUserId) => {
    const { data: { users }, error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
    if (error)
        throw new apiError_1.default(500, 'Gagal mengambil daftar pengguna.');
    const roles = await drizzle_1.db.query.user_roles.findMany();
    const rolesMap = new Map(roles.map((r) => [r.user_id, r.role]));
    const userIds = users.map((u) => u.id);
    const allProfiles = await drizzle_1.db.query.profiles.findMany({
        where: (0, drizzle_orm_1.inArray)(schema_1.profiles.id, userIds)
    });
    const profileMap = new Map(allProfiles.map((p) => [p.id, p]));
    const usersWithRolesAndProfiles = users.map((user) => {
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
    return usersWithRolesAndProfiles.filter((user) => user.role !== 'super_admin' && user.id !== requestingUserId);
};
exports.getAllUsers = getAllUsers;
const deleteUser = async (userId) => {
    const targetRole = await drizzle_1.db.query.user_roles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.user_roles.user_id, userId)
    });
    if (targetRole?.role === 'super_admin') {
        throw new apiError_1.default(403, 'Tidak dapat menghapus akun super_admin.');
    }
    const profile = await drizzle_1.db.query.profiles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.profiles.id, userId)
    });
    if (profile?.telegram_user_id) {
        console.log(`[AutoKick] Attempting to kick Telegram user: ${profile.telegram_user_id}`);
        telegramService
            .kickMember(profile.telegram_user_id)
            .then((success) => {
            if (success) {
                console.log(`[AutoKick] Successfully kicked Telegram user: ${profile.telegram_user_id}`);
            }
            else {
                console.log(`[AutoKick] Failed to kick Telegram user: ${profile.telegram_user_id}`);
            }
        })
            .catch((err) => console.error('[AutoKick] Error:', err));
    }
    const { error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.deleteUser(userId);
    if (error)
        throw new apiError_1.default(500, `Gagal menghapus pengguna: ${error.message}`);
};
exports.deleteUser = deleteUser;
const getUserProfile = async (userId) => {
    let profile = await drizzle_1.db.query.profiles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.profiles.id, userId)
    });
    if (!profile) {
        const { data: { user } } = await supabaseAdmin_1.supabaseAdmin.auth.admin.getUserById(userId);
        if (!user)
            throw new apiError_1.default(404, 'User not found');
        const defaultUsername = user.email?.split('@')[0] || `user-${userId.substring(0, 8)}`;
        const [created] = await drizzle_1.db
            .insert(schema_1.profiles)
            .values({
            id: userId,
            username: defaultUsername,
            security_timestamp: new Date()
        })
            .returning();
        profile = created;
    }
    const { data: { user: authUser }, error: authError } = await supabaseAdmin_1.supabaseAdmin.auth.admin.getUserById(userId);
    if (authError) {
        console.error('Error fetching auth user data:', authError);
    }
    const userRole = await drizzle_1.db.query.user_roles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.user_roles.user_id, userId)
    });
    return {
        ...profile,
        email: authUser?.email,
        role: userRole?.role || 'user',
        avatar_url: authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture,
        full_name: authUser?.user_metadata?.full_name
    };
};
exports.getUserProfile = getUserProfile;
const updateUserRole = async (userId, newRole) => {
    const targetUserRole = await drizzle_1.db.query.user_roles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.user_roles.user_id, userId)
    });
    if (targetUserRole && targetUserRole.role === 'super_admin') {
        throw new apiError_1.default(403, 'Tidak dapat mengubah peran super_admin.');
    }
    const [role] = await drizzle_1.db
        .insert(schema_1.user_roles)
        .values({ user_id: userId, role: newRole })
        .onConflictDoUpdate({
        target: schema_1.user_roles.user_id,
        set: { role: newRole }
    })
        .returning();
    await touchSecurityTimestamp(userId);
    await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole }
    });
    return role;
};
exports.updateUserRole = updateUserRole;
const updateUserStatus = async (userId, status) => {
    const ban_duration = status === 'inactive' ? '876000h' : '0s';
    const { data, error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration });
    await touchSecurityTimestamp(userId);
    if (error) {
        throw new apiError_1.default(500, `Gagal mengubah status pengguna: ${error.message}`);
    }
    if (!data || !data.user) {
        throw new apiError_1.default(404, 'Pengguna tidak ditemukan saat mencoba mengubah status.');
    }
    return data.user;
};
exports.updateUserStatus = updateUserStatus;
const updateUserProfile = async (userId, data) => {
    const profile = await drizzle_1.db.query.profiles.findFirst({
        where: (0, drizzle_orm_1.eq)(schema_1.profiles.id, userId)
    });
    if (!profile)
        throw new apiError_1.default(404, 'Profil tidak ditemukan.');
    const [updated] = await drizzle_1.db
        .update(schema_1.profiles)
        .set({
        ...data,
        security_timestamp: new Date(),
        updated_at: new Date()
    })
        .where((0, drizzle_orm_1.eq)(schema_1.profiles.id, userId))
        .returning();
    return updated;
};
exports.updateUserProfile = updateUserProfile;
const getUserPreferences = async (userId) => {
    return await drizzle_1.db.query.user_notification_preferences.findMany({
        where: (0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.user_id, userId),
        columns: { system_type: true, is_enabled: true }
    });
};
exports.getUserPreferences = getUserPreferences;
const syncAllRolesToSupabase = async () => {
    const roles = await drizzle_1.db.query.user_roles.findMany();
    const results = { success: 0, failed: 0, details: [] };
    for (const role of roles) {
        try {
            await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(role.user_id, {
                app_metadata: { role: role.role }
            });
            results.success++;
            results.details.push({
                user_id: role.user_id,
                role: role.role,
                status: 'synced'
            });
        }
        catch (error) {
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
exports.syncAllRolesToSupabase = syncAllRolesToSupabase;
const updateUserPreferences = async (userId, preferences) => {
    try {
        // Batch strategy: DELETE existing + INSERT all in one transaction.
        // Reduces O(2N) round-trips (per-item SELECT + UPDATE/INSERT) to O(2).
        // Safe because transaction guarantees atomicity — no partial state.
        await drizzle_1.db.transaction(async (tx) => {
            // 1. Delete all existing preferences for this user (single DELETE)
            await tx
                .delete(schema_1.user_notification_preferences)
                .where((0, drizzle_orm_1.eq)(schema_1.user_notification_preferences.user_id, userId));
            // 2. Batch insert all preferences (single INSERT with multiple values)
            if (preferences.length > 0) {
                await tx.insert(schema_1.user_notification_preferences).values(preferences.map((pref) => ({
                    user_id: userId,
                    system_type: pref.system_type,
                    is_enabled: pref.is_enabled
                })));
            }
        });
        return (0, exports.getUserPreferences)(userId);
    }
    catch (error) {
        console.error('[UserService] Failed to update preferences:', error);
        throw new apiError_1.default(500, 'Gagal menyimpan preferensi.');
    }
};
exports.updateUserPreferences = updateUserPreferences;
