"use strict";
/**
 * @file pushController.ts
 * @purpose HTTP handlers for Web Push notification subscription and testing
 * @usedBy userRoutes.ts
 * @deps webPushService, env, ApiError
 * @exports subscribeToPush, getVapidPublicKey, testPushNotification
 * @sideEffects DB write (push_subscriptions), Web Push API calls
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
exports.testPushNotification = exports.getVapidPublicKey = exports.subscribeToPush = void 0;
const env_1 = require("../../config/env");
const webPushService = __importStar(require("../../services/webPushService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const handleError = (res, error) => {
    if (error instanceof apiError_1.default) {
        return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Unhandled Error in PushController:', error);
    return res
        .status(500)
        .json({ message: 'An unexpected internal server error occurred.' });
};
const subscribeToPush = async (req, res) => {
    try {
        const userId = req.user.id;
        const subscription = req.body; // Objek PushSubscription dari browser
        console.log(`[Push] Saving subscription for user ${userId}:`, JSON.stringify(subscription).slice(0, 100) + '...');
        await webPushService.saveSubscription(userId, subscription);
        res.status(201).json({ message: 'Push subscription saved.' });
    }
    catch (error) {
        handleError(res, error);
    }
};
exports.subscribeToPush = subscribeToPush;
const getVapidPublicKey = (req, res) => {
    res.status(200).json({ publicKey: env_1.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
};
exports.getVapidPublicKey = getVapidPublicKey;
// TEST ENDPOINT: Manually trigger a push notification to the current user
const testPushNotification = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`[Push Test] Triggering test notification for user ${userId}`);
        await webPushService.sendPushNotification(userId, {
            title: 'Test Notification',
            body: 'Jika Anda melihat ini, push notification bekerja!',
            url: '/dashboard'
        });
        res
            .status(200)
            .json({ message: 'Test push notification sent. Check your device.' });
    }
    catch (error) {
        console.error('[Push Test] Error:', error);
        handleError(res, error);
    }
};
exports.testPushNotification = testPushNotification;
