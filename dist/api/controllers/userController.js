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
exports.validateSession = exports.updateUserStatus = exports.updateUserRole = exports.updateMyProfile = exports.getMyProfile = exports.deleteUser = exports.listUsers = exports.inviteUser = void 0;
const userService = __importStar(require("../../services/userService"));
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
        const profile = await userService.getUserProfile(userId);
        res.status(200).json(profile);
    }
    catch (error) {
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
        if (!role || !["admin", "user"].includes(role)) {
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
