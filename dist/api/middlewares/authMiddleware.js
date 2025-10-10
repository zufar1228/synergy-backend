"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleBasedAuth = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const profile_1 = __importDefault(require("../../db/models/profile"));
const supabaseAdmin_1 = require("../../config/supabaseAdmin");
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            throw new apiError_1.default(401, "Unauthorized: No token provided");
        }
        const token = authHeader.split(" ")[1];
        const jwtSecret = process.env.SUPABASE_JWT_SECRET;
        if (!jwtSecret)
            throw new apiError_1.default(500, "Internal server error: JWT secret not configured");
        // --- BLOK VERIFIKASI DENGAN LOGGING BARU ---
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        }
        catch (error) {
            // === TAMBAHKAN BLOK DEBUG INI ===
            console.error("!!! DEBUG: JWT Verification Failed !!!");
            console.error("Error Name:", error.name); // e.g., 'JsonWebTokenError', 'TokenExpiredError'
            console.error("Error Message:", error.message); // e.g., 'invalid signature', 'jwt expired'
            console.error("------------------------------------");
            // ===================================
            throw new apiError_1.default(401, "Unauthorized: Invalid token"); // Lemparkan error lagi untuk ditangkap di bawah
        }
        // -----------------------------------------
        const { sub, role, sts } = decoded;
        let profile = await profile_1.default.findByPk(sub, {
            attributes: ["security_timestamp"],
        });
        // === LOGIKA PENGAMAN BARU ===
        // Jika profil tidak ada (misal untuk pengguna lama sebelum ada trigger), buatkan sekarang.
        if (!profile) {
            console.warn(`Profile not found for user ${sub}. Creating one now.`);
            const { data: { user }, } = await supabaseAdmin_1.supabaseAdmin.auth.admin.getUserById(sub);
            if (!user)
                throw new apiError_1.default(404, "User not found in Supabase Auth");
            const defaultUsername = user.email?.split("@")[0] || `user-${sub.substring(0, 8)}`;
            profile = await profile_1.default.create({
                id: sub,
                username: defaultUsername,
                security_timestamp: new Date(),
            });
        }
        // ===========================
        if (!sts) {
            throw new apiError_1.default(401, "Unauthorized: Token is missing security timestamp");
        }
        const tokenTimestamp = new Date(sts);
        const dbTimestamp = new Date(profile.security_timestamp.getTime() - 1000);
        if (tokenTimestamp < dbTimestamp) {
            throw new apiError_1.default(401, "Unauthorized: Session has been revoked");
        }
        req.user = { id: sub, role: role };
        next();
    }
    catch (error) {
        if (error instanceof apiError_1.default)
            return next(error);
        // Tangkapan umum untuk error tak terduga
        return next(new apiError_1.default(401, "Unauthorized"));
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
