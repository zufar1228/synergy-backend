// backend/src/api/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import crypto from 'crypto';
import ApiError from '../../utils/apiError';

// Cache untuk menyimpan JWKS (Public Keys) dari Supabase
let jwksCache: { keys: any[], lastFetch: number } | null = null;

async function getSupabasePublicKey(iss: string, kid: string): Promise<crypto.KeyObject | null> {
  try {
    const now = Date.now();
    // Refresh cache jika kosong atau lebih tua dari 1 jam (3600000 ms)
    if (!jwksCache || (now - jwksCache.lastFetch) > 3600000) {
      // URL JWKS biasanya: https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
      // iss dari token biasanya: https://<project-ref>.supabase.co/auth/v1
      const baseUrl = iss.replace(/\/$/, '');
      const jwksUrl = `${baseUrl}/.well-known/jwks.json`;
      
      console.log(`🔄 Fetching JWKS from ${jwksUrl}...`);
      const response = await axios.get(jwksUrl);
      
      if (response.data && Array.isArray(response.data.keys)) {
        jwksCache = {
          keys: response.data.keys,
          lastFetch: now
        };
        console.log("✅ JWKS cached successfully.");
      }
    }

    if (!jwksCache) return null;

    const jwk = jwksCache.keys.find((k: any) => k.kid === kid);
    
    if (!jwk) {
      console.error(`❌ Key with kid ${kid} not found in JWKS.`);
      return null;
    }

    // Konversi JWK ke KeyObject (Node.js native)
    return crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch (err: any) {
    console.error("❌ Error fetching/parsing JWKS:", err.message);
    return null;
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Ambil token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Silent fail for no token, let routes handle it if needed, or throw error
      // But usually middleware is used on protected routes, so throw error.
      throw new ApiError(401, 'Akses ditolak. Token tidak ditemukan.');
    }

    const token = authHeader.split(' ')[1];
    if (!token || token === 'undefined' || token === 'null') {
      throw new ApiError(401, 'Token tidak valid.');
    }

    // 2. Decode Header untuk melihat Algoritma
    const decodedComplete = jwt.decode(token, { complete: true });
    if (!decodedComplete) {
      throw new ApiError(401, 'Token malformed (tidak dapat didecode).');
    }

    const { alg, kid } = decodedComplete.header;
    const payload = decodedComplete.payload as any;
    
    let secretOrPublicKey: string | Buffer | crypto.KeyObject;

    // 3. Tentukan Kunci Verifikasi berdasarkan Algoritma
    if (alg === 'ES256' || alg === 'RS256') {
      // === ASYMMETRIC KEY (ES256/RS256) ===
      // Token ini menggunakan Public/Private Key. Kita butuh Public Key dari Supabase.
      if (!payload.iss || !kid) {
        throw new ApiError(401, 'Token ES256/RS256 harus memiliki iss dan kid.');
      }

      const publicKey = await getSupabasePublicKey(payload.iss, kid);
      if (!publicKey) {
        throw new ApiError(500, 'Gagal mendapatkan Public Key dari Supabase.');
      }
      secretOrPublicKey = publicKey;

    } else {
      // === SYMMETRIC KEY (HS256) ===
      // Token ini menggunakan Shared Secret (SUPABASE_JWT_SECRET).
      const rawSecret = process.env.SUPABASE_JWT_SECRET || "";
      if (!rawSecret) {
        throw new ApiError(500, 'Server Error: SUPABASE_JWT_SECRET belum diset.');
      }

      // Coba konversi Base64 jika perlu
      if (rawSecret.length > 20 && /^[A-Za-z0-9+/]*={0,2}$/.test(rawSecret)) {
         try {
            secretOrPublicKey = Buffer.from(rawSecret, 'base64');
         } catch {
            secretOrPublicKey = rawSecret;
         }
      } else {
        secretOrPublicKey = rawSecret;
      }
    }

    // 4. Verifikasi Token
    try {
      const decoded = jwt.verify(token, secretOrPublicKey, { algorithms: [alg as jwt.Algorithm] }) as any;
      
      if (!decoded.sub) {
        throw new ApiError(401, 'Token tidak memiliki User ID (sub).');
      }

      // Debug: Log decoded JWT untuk melihat struktur
      console.log('[AuthMiddleware] Decoded JWT app_metadata:', JSON.stringify(decoded.app_metadata));
      console.log('[AuthMiddleware] Decoded JWT role:', decoded.role);
      
      const userRole = decoded.app_metadata?.role || decoded.role || 'user';
      console.log('[AuthMiddleware] Final userRole:', userRole);

      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: userRole,
      };

      next();
    } catch (err: any) {
      console.error(`🔴 JWT Verify Error (${alg}): ${err.message}`);
      if (err.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Sesi berakhir. Silakan login kembali.');
      }
      throw new ApiError(401, `Verifikasi token gagal: ${err.message}`);
    }

  } catch (error) {
    next(error);
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
