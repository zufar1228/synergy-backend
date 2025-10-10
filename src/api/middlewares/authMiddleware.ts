// backend/src/api/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import ApiError from "../../utils/apiError";
import Profile from "../../db/models/profile";
import { supabaseAdmin } from "../../config/supabaseAdmin";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized: No token provided");
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret)
      throw new ApiError(
        500,
        "Internal server error: JWT secret not configured"
      );

    // --- BLOK VERIFIKASI DENGAN LOGGING BARU ---
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret);
    } catch (error: any) {
      // === TAMBAHKAN BLOK DEBUG INI ===
      console.error("!!! DEBUG: JWT Verification Failed !!!");
      console.error("Error Name:", error.name); // e.g., 'JsonWebTokenError', 'TokenExpiredError'
      console.error("Error Message:", error.message); // e.g., 'invalid signature', 'jwt expired'
      console.error("------------------------------------");
      // ===================================
      throw new ApiError(401, "Unauthorized: Invalid token"); // Lemparkan error lagi untuk ditangkap di bawah
    }
    // -----------------------------------------

    const { sub, role, sts } = decoded as {
      sub: string;
      role: string;
      sts?: string;
    };

    let profile = await Profile.findByPk(sub, {
      attributes: ["security_timestamp"],
    });

    // === LOGIKA PENGAMAN BARU ===
    // Jika profil tidak ada (misal untuk pengguna lama sebelum ada trigger), buatkan sekarang.
    if (!profile) {
      console.warn(`Profile not found for user ${sub}. Creating one now.`);
      const {
        data: { user },
      } = await supabaseAdmin.auth.admin.getUserById(sub);
      if (!user) throw new ApiError(404, "User not found in Supabase Auth");

      const defaultUsername =
        user.email?.split("@")[0] || `user-${sub.substring(0, 8)}`;
      profile = await Profile.create({
        id: sub,
        username: defaultUsername,
        security_timestamp: new Date(),
      });
    }
    // ===========================

    if (!sts) {
      throw new ApiError(
        401,
        "Unauthorized: Token is missing security timestamp"
      );
    }

    const tokenTimestamp = new Date(sts);
    const dbTimestamp = new Date(profile.security_timestamp.getTime() - 1000);

    if (tokenTimestamp < dbTimestamp) {
      throw new ApiError(401, "Unauthorized: Session has been revoked");
    }

    req.user = { id: sub, role: role };
    next();
  } catch (error) {
    if (error instanceof ApiError) return next(error);
    // Tangkapan umum untuk error tak terduga
    return next(new ApiError(401, "Unauthorized"));
  }
};

export const roleBasedAuth = (allowedRoles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !user.role) {
      return next(new ApiError(401, "Unauthorized: User data is missing"));
    }
    if (allowedRoles.includes(user.role)) {
      next();
    } else {
      return next(
        new ApiError(
          403,
          "Forbidden: You do not have permission to perform this action"
        )
      );
    }
  };
};
