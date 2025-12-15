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
exports.testPushNotification = exports.syncAllRoles = exports.getVapidPublicKey = exports.subscribeToPush = exports.updateMyPreferences = exports.getMyPreferences = exports.validateSession = exports.updateUserStatus = exports.updateUserRole = exports.updateMyProfile = exports.getMyProfile = exports.deleteUser = exports.listUsers = exports.inviteUser = void 0;
const userService = __importStar(require("../../services/userService"));
const webPushService = __importStar(require("../../services/webPushService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const inviteUser = async (req, res) => {
    const { email, role } = req.body;
    if (!email || !role) {
        return res.status(400).json({ message: "Email dan role wajib diisi." });
    }
    try {
        const user = await userService.inviteUser(email, role);
        res.status(200).json({ message: "Undangan berhasil dikirim.", user });
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: "Terjadi kesalahan tak terduga." });
    }
};
exports.inviteUser = inviteUser;
const listUsers = async (req, res) => {
    try {
        const requestingUserId = req.user.id; // Dapatkan ID super_admin yang membuat request
        const users = await userService.getAllUsers(requestingUserId);
        res.status(200).json(users);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.listUsers = listUsers;
const deleteUser = async (req, res) => {
    try {
        await userService.deleteUser(req.params.id);
        res.status(204).send();
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        res.status(500).json({ message: "Terjadi kesalahan tak terduga." });
    }
};
exports.deleteUser = deleteUser;
const getMyProfile = async (req, res) => {
    try {
        // Ambil user ID dari middleware, bukan dari parameter URL
        const userId = req.user?.id;
        if (!userId)
            throw new apiError_1.default(401, "User not authenticated");
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
            throw new apiError_1.default(401, "User not authenticated");
        const { username } = req.body;
        if (!username)
            return res.status(400).json({ message: "Username is required." });
        const profile = await userService.updateUserProfile(userId, { username });
        res.status(200).json(profile);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateMyProfile = updateMyProfile;
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    // Log error yang tidak terduga untuk debugging
    console.error("Unhandled Error in UserController:", error);
    return res
        .status(500)
        .json({ message: "An unexpected internal server error occurred." });
};
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!role || !["admin", "user", "super_admin"].includes(role)) {
            return res.status(400).json({ message: "Peran tidak valid." });
        }
        const updatedRole = await userService.updateUserRole(id, role);
        res.status(200).json(updatedRole);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateUserRole = updateUserRole;
const updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status || !["active", "inactive"].includes(status)) {
            return res.status(400).json({ message: "Status tidak valid." });
        }
        const updatedUser = await userService.updateUserStatus(id, status);
        res.status(200).json(updatedUser);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateUserStatus = updateUserStatus;
const validateSession = (req, res) => {
    // Jika middleware berhasil dilewati, berarti token valid.
    // Cukup kirim respons sukses.
    res.status(200).json({ valid: true });
};
exports.validateSession = validateSession;
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
                .json({ message: "Request body harus berupa array." });
        }
        const updatedPreferences = await userService.updateUserPreferences(userId, preferences);
        res.status(200).json(updatedPreferences);
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.updateMyPreferences = updateMyPreferences;
const subscribeToPush = async (req, res) => {
    try {
        const userId = req.user.id;
        const subscription = req.body; // Objek PushSubscription dari browser
        console.log(`[Push] Saving subscription for user ${userId}:`, JSON.stringify(subscription).slice(0, 100) + '...');
        await webPushService.saveSubscription(userId, subscription);
        res.status(201).json({ message: "Push subscription saved." });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.subscribeToPush = subscribeToPush;
const getVapidPublicKey = (req, res) => {
    res.status(200).json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
};
exports.getVapidPublicKey = getVapidPublicKey;
// Sync all roles from database to Supabase app_metadata
const syncAllRoles = async (req, res) => {
    try {
        console.log(`[syncAllRoles] Starting sync by user ${req.user?.id}`);
        const result = await userService.syncAllRolesToSupabase();
        console.log(`[syncAllRoles] Sync complete:`, result);
        res.status(200).json({ message: 'Roles synced successfully', ...result });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.syncAllRoles = syncAllRoles;
// TEST ENDPOINT: Manually trigger a push notification to the current user
const testPushNotification = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[Push Test] Triggering test notification for user ${userId}`);
        await webPushService.sendPushNotification(userId, {
            title: "🧪 Test Notification",
            body: "Jika Anda melihat ini, push notification bekerja!",
            url: "/dashboard",
        });
        res.status(200).json({ message: "Test push notification sent. Check your device." });
    }
    catch (error) {
        console.error("[Push Test] Error:", error);
        handleError(res, error);
    }
};
exports.testPushNotification = testPushNotification;
