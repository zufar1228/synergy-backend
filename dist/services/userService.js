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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPreferences = exports.syncAllRolesToSupabase = exports.getUserPreferences = exports.updateUserProfile = exports.updateUserStatus = exports.updateUserRole = exports.getUserProfile = exports.deleteUser = exports.getAllUsers = exports.inviteUser = void 0;
// backend/src/services/userService.ts
const supabaseAdmin_1 = require("../config/supabaseAdmin");
const notificationService_1 = require("./notificationService");
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const config_1 = require("../db/config");
const telegramService = __importStar(require("./telegramService"));
const touchSecurityTimestamp = async (userId) => {
    await models_1.Profile.update({ security_timestamp: new Date() }, { where: { id: userId } });
};
const inviteUser = async (email, role) => {
    const { data, error: linkError } = await supabaseAdmin_1.supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: email,
        options: {
            redirectTo: process.env.FRONTEND_URL + "/setup-account",
        },
    });
    if (linkError) {
        if (linkError.message.includes("already been registered")) {
            throw new apiError_1.default(409, "Pengguna dengan email ini sudah terdaftar.");
        }
        throw new apiError_1.default(400, linkError.message);
    }
    const invitedUser = data.user;
    const inviteLink = data.properties.action_link;
    try {
        // === PERBAIKAN: Ganti 'upsert' dengan logika 'find-then-update-or-create' ===
        const [userRole, created] = await models_1.UserRole.findOrCreate({
            where: { user_id: invitedUser.id },
            defaults: { user_id: invitedUser.id, role: role },
        });
        // Jika tidak dibuat (artinya sudah ada), maka update
        if (!created) {
            await userRole.update({ role: role });
        }
        // === SYNC ROLE KE SUPABASE APP_METADATA ===
        // Ini akan membuat JWT mengandung role yang benar
        await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(invitedUser.id, {
            app_metadata: { role: role }
        });
        // ===================================================================
    }
    catch (dbError) {
        // Tambahkan log detail untuk debugging di masa depan
        console.error("!!! DEBUG: Database error while saving user role:", dbError);
        // Bersihkan user yang baru dibuat di Supabase Auth jika penyimpanan peran gagal
        await supabaseAdmin_1.supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
        throw new apiError_1.default(500, "Gagal menyimpan peran pengguna.");
    }
    await (0, notificationService_1.sendInviteEmail)({ to: email, inviteLink: inviteLink });
    return invitedUser;
};
exports.inviteUser = inviteUser;
// Fungsi untuk mengambil semua pengguna
const getAllUsers = async (requestingUserId) => {
    const { data: { users }, error, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.listUsers();
    if (error)
        throw new apiError_1.default(500, "Gagal mengambil daftar pengguna.");
    const roles = await models_1.UserRole.findAll();
    const rolesMap = new Map(roles.map((r) => [r.user_id, r.role]));
    // Gabungkan data auth dengan roles dan profile pictures
    const usersWithRolesAndProfiles = await Promise.all(users.map(async (user) => {
        const role = rolesMap.get(user.id) || "user";
        // Ambil profile dari database jika ada
        const profile = await models_1.Profile.findByPk(user.id);
        return {
            ...user,
            role: role,
            username: profile?.username,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
            full_name: user.user_metadata?.full_name,
        };
    }));
    // Filter untuk tidak menampilkan super_admin lain DAN tidak menampilkan diri sendiri
    return usersWithRolesAndProfiles.filter((user) => user.role !== "super_admin" && user.id !== requestingUserId);
};
exports.getAllUsers = getAllUsers;
// Fungsi untuk menghapus pengguna
const deleteUser = async (userId) => {
    // 1. Ambil data profil user sebelum dihapus (untuk cek Telegram ID)
    const profile = await models_1.Profile.findByPk(userId);
    // 2. AUTO-KICK TELEGRAM (jika user terhubung ke Telegram)
    if (profile?.telegram_user_id) {
        console.log(`[AutoKick] Attempting to kick Telegram user: ${profile.telegram_user_id}`);
        // Best effort strategy - tidak blocking proses delete
        telegramService.kickMember(profile.telegram_user_id)
            .then((success) => {
            if (success) {
                console.log(`[AutoKick] ✅ Successfully kicked Telegram user: ${profile.telegram_user_id}`);
            }
            else {
                console.log(`[AutoKick] ⚠️ Failed to kick Telegram user (might not be in group): ${profile.telegram_user_id}`);
            }
        })
            .catch((err) => console.error('[AutoKick] ❌ Error:', err));
    }
    // 3. Hapus dari Supabase Auth
    const { error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.deleteUser(userId);
    if (error)
        throw new apiError_1.default(500, `Gagal menghapus pengguna: ${error.message}`);
};
exports.deleteUser = deleteUser;
const getUserProfile = async (userId) => {
    let profile = await models_1.Profile.findByPk(userId);
    // Jika profil belum ada untuk pengguna baru, buatkan satu
    if (!profile) {
        // Ambil detail pengguna dari Supabase Auth untuk mendapatkan email
        const { data: { user }, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.getUserById(userId);
        if (!user)
            throw new apiError_1.default(404, "User not found");
        // Gunakan bagian sebelum '@' dari email sebagai username default
        const defaultUsername = user.email?.split("@")[0] || `user-${userId.substring(0, 8)}`;
        profile = await models_1.Profile.create({
            id: userId,
            username: defaultUsername,
            security_timestamp: new Date(),
        });
    }
    // Ambil data lengkap dari Supabase Auth termasuk avatar/profile picture
    const { data: { user: authUser }, error: authError, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.getUserById(userId);
    if (authError) {
        console.error("Error fetching auth user data:", authError);
    }
    // Ambil role dari tabel UserRole
    const userRole = await models_1.UserRole.findOne({ where: { user_id: userId } });
    // Gabungkan data profil database dengan data auth (termasuk avatar)
    const fullProfile = {
        ...profile.toJSON(),
        email: authUser?.email,
        role: userRole?.role || "user", // Default ke 'user' jika tidak ditemukan
        avatar_url: authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture,
        full_name: authUser?.user_metadata?.full_name,
        // Tambahkan data auth lainnya yang mungkin diperlukan
    };
    return fullProfile;
};
exports.getUserProfile = getUserProfile;
// Fungsi BARU untuk memperbarui profil pengguna saat ini
const updateUserRole = async (userId, newRole) => {
    // Cegah perubahan peran pada diri sendiri atau pengguna lain jika tidak sengaja
    const targetUserRole = await models_1.UserRole.findOne({ where: { user_id: userId } });
    if (targetUserRole && targetUserRole.role === "super_admin") {
        throw new apiError_1.default(403, "Tidak dapat mengubah peran super_admin.");
    }
    const [role, created] = await models_1.UserRole.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, role: newRole },
    });
    if (!created) {
        await role.update({ role: newRole });
        await touchSecurityTimestamp(userId);
    }
    // === SYNC ROLE KE SUPABASE APP_METADATA ===
    await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole }
    });
    return role;
};
exports.updateUserRole = updateUserRole;
const updateUserStatus = async (userId, status) => {
    // === PERBAIKI LOGIKA DI SINI ===
    const ban_duration = status === "inactive"
        ? "876000h" // Ban untuk 876,000 jam (setara 100 tahun)
        : "0s"; // '0s' untuk langsung meng-unban
    const { data, error } = await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: ban_duration,
    });
    await touchSecurityTimestamp(userId);
    if (error) {
        throw new apiError_1.default(500, `Gagal mengubah status pengguna: ${error.message}`);
    }
    // Pastikan data dan user ada sebelum dikembalikan
    if (!data || !data.user) {
        throw new apiError_1.default(404, "Pengguna tidak ditemukan saat mencoba mengubah status.");
    }
    return data.user;
};
exports.updateUserStatus = updateUserStatus;
// TAMBAHKAN FUNGSI INI KEMBALI
const updateUserProfile = async (userId, data) => {
    const profile = await models_1.Profile.findByPk(userId);
    if (!profile)
        throw new apiError_1.default(404, "Profil tidak ditemukan.");
    await profile.update({
        ...data,
        // PENTING: Update security_timestamp untuk memaksa logout sesi lain
        security_timestamp: new Date(),
    });
    return profile;
};
exports.updateUserProfile = updateUserProfile;
const getUserPreferences = async (userId) => {
    const preferences = await models_1.UserNotificationPreference.findAll({
        where: { user_id: userId },
        attributes: ["system_type", "is_enabled"],
    });
    return preferences;
};
exports.getUserPreferences = getUserPreferences;
// === SYNC ALL ROLES TO SUPABASE APP_METADATA ===
// Berguna jika role diubah langsung di database tanpa melalui API
const syncAllRolesToSupabase = async () => {
    const roles = await models_1.UserRole.findAll();
    const results = { success: 0, failed: 0, details: [] };
    for (const role of roles) {
        try {
            await supabaseAdmin_1.supabaseAdmin.auth.admin.updateUserById(role.user_id, {
                app_metadata: { role: role.role }
            });
            results.success++;
            results.details.push({ user_id: role.user_id, role: role.role, status: 'synced' });
        }
        catch (error) {
            results.failed++;
            results.details.push({ user_id: role.user_id, role: role.role, status: 'failed', error: error.message });
        }
    }
    return results;
};
exports.syncAllRolesToSupabase = syncAllRolesToSupabase;
const updateUserPreferences = async (userId, preferences) => {
    const transaction = await config_1.sequelize.transaction();
    try {
        for (const pref of preferences) {
            // === PERBAIKAN: Ganti 'upsert' dengan 'findOrCreate' + 'update' ===
            // 1. Coba cari atau buat entri baru
            const [preference, created] = await models_1.UserNotificationPreference.findOrCreate({
                where: {
                    user_id: userId,
                    system_type: pref.system_type,
                },
                defaults: {
                    user_id: userId,
                    system_type: pref.system_type,
                    is_enabled: pref.is_enabled,
                },
                transaction: transaction, // Pastikan menggunakan transaksi
            });
            // 2. Jika tidak dibuat (artinya sudah ada), maka update nilainya
            if (!created) {
                await preference.update({ is_enabled: pref.is_enabled }, { transaction: transaction });
            }
            // ==========================================================
        }
        await transaction.commit();
        return (0, exports.getUserPreferences)(userId); // Kembalikan data yang sudah diperbarui
    }
    catch (error) {
        // Tambahkan log ini untuk melihat error spesifik di terminal backend jika terjadi lagi
        console.error("!!! DEBUG: Gagal saat update preferensi:", error);
        await transaction.rollback();
        throw new apiError_1.default(500, "Gagal menyimpan preferensi.");
    }
};
exports.updateUserPreferences = updateUserPreferences;
