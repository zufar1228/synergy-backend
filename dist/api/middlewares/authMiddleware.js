"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleBasedAuth = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
// Cache untuk menyimpan JWKS (Public Keys) dari Supabase
let jwksCache = null;
async function getSupabasePublicKey(iss, kid) {
    try {
        const now = Date.now();
        // Refresh cache jika kosong atau lebih tua dari 1 jam (3600000 ms)
        if (!jwksCache || (now - jwksCache.lastFetch) > 3600000) {
            // URL JWKS biasanya: https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
            // iss dari token biasanya: https://<project-ref>.supabase.co/auth/v1
            const baseUrl = iss.replace(/\/$/, '');
            const jwksUrl = `${baseUrl}/.well-known/jwks.json`;
            console.log(`🔄 Fetching JWKS from ${jwksUrl}...`);
            const response = await axios_1.default.get(jwksUrl);
            if (response.data && Array.isArray(response.data.keys)) {
                jwksCache = {
                    keys: response.data.keys,
                    lastFetch: now
                };
                console.log("✅ JWKS cached successfully.");
            }
        }
        if (!jwksCache)
            return null;
        const jwk = jwksCache.keys.find((k) => k.kid === kid);
        if (!jwk) {
            console.error(`❌ Key with kid ${kid} not found in JWKS.`);
            return null;
        }
        // Konversi JWK ke KeyObject (Node.js native)
        return crypto_1.default.createPublicKey({ key: jwk, format: 'jwk' });
    }
    catch (err) {
        console.error("❌ Error fetching/parsing JWKS:", err.message);
        return null;
    }
}
const authMiddleware = async (req, res, next) => {
    try {
        // 1. Ambil token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // Silent fail for no token, let routes handle it if needed, or throw error
            // But usually middleware is used on protected routes, so throw error.
            throw new apiError_1.default(401, 'Akses ditolak. Token tidak ditemukan.');
        }
        const token = authHeader.split(' ')[1];
        if (!token || token === 'undefined' || token === 'null') {
            throw new apiError_1.default(401, 'Token tidak valid.');
        }
        // 2. Decode Header untuk melihat Algoritma
        const decodedComplete = jsonwebtoken_1.default.decode(token, { complete: true });
        if (!decodedComplete) {
            throw new apiError_1.default(401, 'Token malformed (tidak dapat didecode).');
        }
        const { alg, kid } = decodedComplete.header;
        const payload = decodedComplete.payload;
        let secretOrPublicKey;
        // 3. Tentukan Kunci Verifikasi berdasarkan Algoritma
        if (alg === 'ES256' || alg === 'RS256') {
            // === ASYMMETRIC KEY (ES256/RS256) ===
            // Token ini menggunakan Public/Private Key. Kita butuh Public Key dari Supabase.
            if (!payload.iss || !kid) {
                throw new apiError_1.default(401, 'Token ES256/RS256 harus memiliki iss dan kid.');
            }
            const publicKey = await getSupabasePublicKey(payload.iss, kid);
            if (!publicKey) {
                throw new apiError_1.default(500, 'Gagal mendapatkan Public Key dari Supabase.');
            }
            secretOrPublicKey = publicKey;
        }
        else {
            // === SYMMETRIC KEY (HS256) ===
            // Token ini menggunakan Shared Secret (SUPABASE_JWT_SECRET).
            const rawSecret = process.env.SUPABASE_JWT_SECRET || "";
            if (!rawSecret) {
                throw new apiError_1.default(500, 'Server Error: SUPABASE_JWT_SECRET belum diset.');
            }
            // Coba konversi Base64 jika perlu
            if (rawSecret.length > 20 && /^[A-Za-z0-9+/]*={0,2}$/.test(rawSecret)) {
                try {
                    secretOrPublicKey = Buffer.from(rawSecret, 'base64');
                }
                catch {
                    secretOrPublicKey = rawSecret;
                }
            }
            else {
                secretOrPublicKey = rawSecret;
            }
        }
        // 4. Verifikasi Token
        try {
            const decoded = jsonwebtoken_1.default.verify(token, secretOrPublicKey, { algorithms: [alg] });
            if (!decoded.sub) {
                throw new apiError_1.default(401, 'Token tidak memiliki User ID (sub).');
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
        }
        catch (err) {
            console.error(`🔴 JWT Verify Error (${alg}): ${err.message}`);
            if (err.name === 'TokenExpiredError') {
                throw new apiError_1.default(401, 'Sesi berakhir. Silakan login kembali.');
            }
            throw new apiError_1.default(401, `Verifikasi token gagal: ${err.message}`);
        }
    }
    catch (error) {
        next(error);
    }
};
exports.authMiddleware = authMiddleware;
const roleBasedAuth = (allowedRoles) => {
    return (req, _res, next) => {
        const user = req.user;
        if (!user || !user.role) {
            return next(new apiError_1.default(401, "Unauthorized: User data is missing"));
        }
        if (allowedRoles.includes(user.role)) {
            next();
        }
        else {
            return next(new apiError_1.default(403, "Forbidden: You do not have permission to perform this action"));
        }
    };
};
exports.roleBasedAuth = roleBasedAuth;
