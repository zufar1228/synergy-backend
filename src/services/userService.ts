// backend/src/services/userService.ts
import { supabaseAdmin } from "../config/supabaseAdmin";
import { sendInviteEmail } from "./notificationService";
import { Profile, UserRole, UserNotificationPreference } from "../db/models";
import ApiError from "../utils/apiError";
import { User } from "@supabase/supabase-js";
import { en } from "zod/v4/locales";
import { sequelize } from "../db/config";
import * as telegramService from "./telegramService";

const touchSecurityTimestamp = async (userId: string) => {
  await Profile.update(
    { security_timestamp: new Date() },
    { where: { id: userId } }
  );
};

export const inviteUser = async (
  email: string,
  role: "admin" | "user" | "super_admin"
) => {
  const { data, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: email,
      options: {
        redirectTo: process.env.FRONTEND_URL + "/setup-account",
      },
    });

  if (linkError) {
    if (linkError.message.includes("already been registered")) {
      throw new ApiError(409, "Pengguna dengan email ini sudah terdaftar.");
    }
    throw new ApiError(400, linkError.message);
  }

  const invitedUser = data.user;
  const inviteLink = data.properties.action_link;

  try {
    // === PERBAIKAN: Ganti 'upsert' dengan logika 'find-then-update-or-create' ===
    const [userRole, created] = await UserRole.findOrCreate({
      where: { user_id: invitedUser.id },
      defaults: { user_id: invitedUser.id, role: role },
    });

    // Jika tidak dibuat (artinya sudah ada), maka update
    if (!created) {
      await userRole.update({ role: role });
    }
    
    // === SYNC ROLE KE SUPABASE APP_METADATA ===
    // Ini akan membuat JWT mengandung role yang benar
    await supabaseAdmin.auth.admin.updateUserById(invitedUser.id, {
      app_metadata: { role: role }
    });
    // ===================================================================
  } catch (dbError) {
    // Tambahkan log detail untuk debugging di masa depan
    console.error("!!! DEBUG: Database error while saving user role:", dbError);

    // Bersihkan user yang baru dibuat di Supabase Auth jika penyimpanan peran gagal
    await supabaseAdmin.auth.admin.deleteUser(invitedUser.id);
    throw new ApiError(500, "Gagal menyimpan peran pengguna.");
  }

  await sendInviteEmail({ to: email, inviteLink: inviteLink });

  return invitedUser;
};

// Fungsi untuk mengambil semua pengguna
export const getAllUsers = async (requestingUserId: string) => {
  const {
    data: { users },
    error,
  } = await supabaseAdmin.auth.admin.listUsers();
  if (error) throw new ApiError(500, "Gagal mengambil daftar pengguna.");

  const roles = await UserRole.findAll();
  const rolesMap = new Map(roles.map((r) => [r.user_id, r.role]));

  // Gabungkan data auth dengan roles dan profile pictures
  const usersWithRolesAndProfiles = await Promise.all(
    users.map(async (user: User) => {
      const role = rolesMap.get(user.id) || "user";

      // Ambil profile dari database jika ada
      const profile = await Profile.findByPk(user.id);

      return {
        ...user,
        role: role,
        username: profile?.username,
        avatar_url:
          user.user_metadata?.avatar_url || user.user_metadata?.picture,
        full_name: user.user_metadata?.full_name,
      };
    })
  );

  // Filter untuk tidak menampilkan super_admin lain DAN tidak menampilkan diri sendiri
  return usersWithRolesAndProfiles.filter(
    (user: User & { role: string }) =>
      user.role !== "super_admin" && user.id !== requestingUserId
  );
};

// Fungsi untuk menghapus pengguna
export const deleteUser = async (userId: string) => {
  // 1. Ambil data profil user sebelum dihapus (untuk cek Telegram ID)
  const profile = await Profile.findByPk(userId);
  
  // 2. AUTO-KICK TELEGRAM (jika user terhubung ke Telegram)
  if (profile?.telegram_user_id) {
    console.log(`[AutoKick] Attempting to kick Telegram user: ${profile.telegram_user_id}`);
    
    // Best effort strategy - tidak blocking proses delete
    telegramService.kickMember(profile.telegram_user_id)
      .then((success) => {
        if (success) {
          console.log(`[AutoKick] ✅ Successfully kicked Telegram user: ${profile.telegram_user_id}`);
        } else {
          console.log(`[AutoKick] ⚠️ Failed to kick Telegram user (might not be in group): ${profile.telegram_user_id}`);
        }
      })
      .catch((err) => console.error('[AutoKick] ❌ Error:', err));
  }

  // 3. Hapus dari Supabase Auth
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error)
    throw new ApiError(500, `Gagal menghapus pengguna: ${error.message}`);
};

export const getUserProfile = async (userId: string) => {
  let profile = await Profile.findByPk(userId);

  // Jika profil belum ada untuk pengguna baru, buatkan satu
  if (!profile) {
    // Ambil detail pengguna dari Supabase Auth untuk mendapatkan email
    const {
      data: { user },
    } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!user) throw new ApiError(404, "User not found");

    // Gunakan bagian sebelum '@' dari email sebagai username default
    const defaultUsername =
      user.email?.split("@")[0] || `user-${userId.substring(0, 8)}`;

    profile = await Profile.create({
      id: userId,
      username: defaultUsername,
      security_timestamp: new Date(),
    });
  }

  // Ambil data lengkap dari Supabase Auth termasuk avatar/profile picture
  const {
    data: { user: authUser },
    error: authError,
  } = await supabaseAdmin.auth.admin.getUserById(userId);

  if (authError) {
    console.error("Error fetching auth user data:", authError);
  }

  // Ambil role dari tabel UserRole
  const userRole = await UserRole.findOne({ where: { user_id: userId } });

  // Gabungkan data profil database dengan data auth (termasuk avatar)
  const fullProfile = {
    ...profile.toJSON(),
    email: authUser?.email,
    role: userRole?.role || "user", // Default ke 'user' jika tidak ditemukan
    avatar_url:
      authUser?.user_metadata?.avatar_url || authUser?.user_metadata?.picture,
    full_name: authUser?.user_metadata?.full_name,
    // Tambahkan data auth lainnya yang mungkin diperlukan
  };

  return fullProfile;
};

// Fungsi BARU untuk memperbarui profil pengguna saat ini
export const updateUserRole = async (
  userId: string,
  newRole: "admin" | "user" | "super_admin"
) => {
  // Cegah perubahan peran pada diri sendiri atau pengguna lain jika tidak sengaja
  const targetUserRole = await UserRole.findOne({ where: { user_id: userId } });
  if (targetUserRole && targetUserRole.role === "super_admin") {
    throw new ApiError(403, "Tidak dapat mengubah peran super_admin.");
  }

  const [role, created] = await UserRole.findOrCreate({
    where: { user_id: userId },
    defaults: { user_id: userId, role: newRole },
  });

  if (!created) {
    await role.update({ role: newRole });
    await touchSecurityTimestamp(userId);
  }

  // === SYNC ROLE KE SUPABASE APP_METADATA ===
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { role: newRole }
  });

  return role;
};

export const updateUserStatus = async (
  userId: string,
  status: "active" | "inactive"
) => {
  // === PERBAIKI LOGIKA DI SINI ===
  const ban_duration =
    status === "inactive"
      ? "876000h" // Ban untuk 876,000 jam (setara 100 tahun)
      : "0s"; // '0s' untuk langsung meng-unban

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    {
      ban_duration: ban_duration,
    }
  );

  await touchSecurityTimestamp(userId);

  if (error) {
    throw new ApiError(500, `Gagal mengubah status pengguna: ${error.message}`);
  }

  // Pastikan data dan user ada sebelum dikembalikan
  if (!data || !data.user) {
    throw new ApiError(
      404,
      "Pengguna tidak ditemukan saat mencoba mengubah status."
    );
  }

  return data.user;
};

// TAMBAHKAN FUNGSI INI KEMBALI
export const updateUserProfile = async (
  userId: string,
  data: { username: string }
) => {
  const profile = await Profile.findByPk(userId);
  if (!profile) throw new ApiError(404, "Profil tidak ditemukan.");
  await profile.update({
    ...data,
    // PENTING: Update security_timestamp untuk memaksa logout sesi lain
    security_timestamp: new Date(),
  });
  return profile;
};

export const getUserPreferences = async (userId: string) => {
  const preferences = await UserNotificationPreference.findAll({
    where: { user_id: userId },
    attributes: ["system_type", "is_enabled"],
  });
  return preferences;
};

// === SYNC ALL ROLES TO SUPABASE APP_METADATA ===
// Berguna jika role diubah langsung di database tanpa melalui API
export const syncAllRolesToSupabase = async () => {
  const roles = await UserRole.findAll();
  const results = { success: 0, failed: 0, details: [] as any[] };

  for (const role of roles) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(role.user_id, {
        app_metadata: { role: role.role }
      });
      results.success++;
      results.details.push({ user_id: role.user_id, role: role.role, status: 'synced' });
    } catch (error: any) {
      results.failed++;
      results.details.push({ user_id: role.user_id, role: role.role, status: 'failed', error: error.message });
    }
  }

  return results;
};

export const updateUserPreferences = async (
  userId: string,
  preferences: { system_type: string; is_enabled: boolean }[]
) => {
  const transaction = await sequelize.transaction();
  try {
    for (const pref of preferences) {
      // === PERBAIKAN: Ganti 'upsert' dengan 'findOrCreate' + 'update' ===

      // 1. Coba cari atau buat entri baru
      const [preference, created] =
        await UserNotificationPreference.findOrCreate({
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
        await preference.update(
          { is_enabled: pref.is_enabled },
          { transaction: transaction }
        );
      }
      // ==========================================================
    }

    await transaction.commit();
    return getUserPreferences(userId); // Kembalikan data yang sudah diperbarui
  } catch (error) {
    // Tambahkan log ini untuk melihat error spesifik di terminal backend jika terjadi lagi
    console.error("!!! DEBUG: Gagal saat update preferensi:", error);

    await transaction.rollback();
    throw new ApiError(500, "Gagal menyimpan preferensi.");
  }
};
