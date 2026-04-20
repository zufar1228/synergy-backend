"use strict";
/**
 * @file profileController.ts
 * @purpose HTTP handlers for user profile, preferences, and access verification
 * @usedBy userRoutes.ts
 * @deps userService, ApiError
 * @exports verifyAccess, getMyProfile, updateMyProfile, getMyPreferences, updateMyPreferences
 * @sideEffects DB read/write (profiles, user_notification_preferences), Supabase Auth API
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
exports.updateMyPreferences = exports.getMyPreferences = exports.updateMyProfile = exports.getMyProfile = exports.verifyAccess = void 0;
const userService = __importStar(require("../../services/userService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
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
const verifyAccess = async (req, res) => {
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
    }
    catch (error) {
        console.error('[verifyAccess] Error:', error);
        res.status(500).json({
            authorized: false,
            message: 'Terjadi kesalahan saat memverifikasi akses.'
        });
    }
};
exports.verifyAccess = verifyAccess;
const getMyProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new apiError_1.default(401, 'User not authenticated');
        console.log(`[getMyProfile] Fetching profile for user: ${userId}`);
        const profile = await userService.getUserProfile(userId);
        console.log(`[getMyProfile] Profile found:`, JSON.stringify(profile, null, 2));
        res.status(200).json(profile);
    }
    catch (error) {
        console.error(`[getMyProfile] Error:`, error);
        handleError(res, error);
    }
};
exports.getMyProfile = getMyProfile;
const updateMyProfile = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            throw new apiError_1.default(401, 'User not authenticated');
        const { username } = req.body;
        if (!username)
            return res.status(400).json({ message: 'Username is required.' });
        const profile = await userService.updateUserProfile(userId, { username });
        res.status(200).json(profile);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateMyProfile = updateMyProfile;
const getMyPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const preferences = await userService.getUserPreferences(userId);
        res.status(200).json(preferences);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.getMyPreferences = getMyPreferences;
// Handler BARU
const updateMyPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const preferences = req.body; // Harapannya adalah array of objects
        if (!Array.isArray(preferences)) {
            return res
                .status(400)
                .json({ message: 'Request body harus berupa array.' });
        }
        const updatedPreferences = await userService.updateUserPreferences(userId, preferences);
        res.status(200).json(updatedPreferences);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateMyPreferences = updateMyPreferences;
