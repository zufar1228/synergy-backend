// backend/src/services/userService.ts
import { supabaseAdmin } from "../config/supabaseAdmin";
import { sendInviteEmail } from "./notificationService";
import { Profile } from "../db/models"; // Ganti dengan model yang sesuai jika perlu
import ApiError from "../utils/apiError";
import { UserRole } from "../db/models/userRole";
import { User } from "@supabase/supabase-js";
import { en } from "zod/v4/locales";
import { UserNotificationPreference } from "../db/models";
import { sequelize } from "../db/config";

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
      defaults: { role: role },
    });

    // Jika tidak dibuat (artinya sudah ada), maka update
    if (!created) {
      await userRole.update({ role: role });
    }
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

  // Gabungkan data profil database dengan data auth (termasuk avatar)
  const fullProfile = {
    ...profile.toJSON(),
    email: authUser?.email,
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
    defaults: { role: newRole },
  });

  if (!created) {
    await role.update({ role: newRole });
    await touchSecurityTimestamp(userId);
  }

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

// Fungsi BARU untuk memperbarui preferensi pengguna
export const updateUserPreferences = async (
  userId: string,
  preferences: { system_type: string; is_enabled: boolean }[]
) => {
  // Gunakan 'upsert' dalam satu transaksi agar atomik
  const transaction = await sequelize.transaction();
  try {
    for (const pref of preferences) {
      await UserNotificationPreference.upsert(
        { user_id: userId, ...pref },
        { transaction }
      );
    }
    await transaction.commit();
    return getUserPreferences(userId); // Kembalikan data yang sudah diperbarui
  } catch (error) {
    await transaction.rollback();
    throw new ApiError(500, "Gagal menyimpan preferensi.");
  }
};
