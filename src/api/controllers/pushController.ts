/**
 * @file pushController.ts
 * @purpose HTTP handlers for Web Push notification subscription and testing
 * @usedBy userRoutes.ts
 * @deps webPushService, env, ApiError
 * @exports subscribeToPush, getVapidPublicKey, testPushNotification
 * @sideEffects DB write (push_subscriptions), Web Push API calls
 */

import { Request, Response } from 'express';
import { env } from '../../config/env';
import * as webPushService from '../../services/webPushService';
import ApiError from '../../utils/apiError';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error('Unhandled Error in PushController:', error);
  return res
    .status(500)
    .json({ message: 'An unexpected internal server error occurred.' });
};

export const subscribeToPush = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const subscription = req.body; // Objek PushSubscription dari browser
    console.log(
      `[Push] Saving subscription for user ${userId}:`,
      JSON.stringify(subscription).slice(0, 100) + '...'
    );
    await webPushService.saveSubscription(userId, subscription);
    res.status(201).json({ message: 'Push subscription saved.' });
  } catch (error) {
    handleError(res, error);
  }
};

export const getVapidPublicKey = (req: Request, res: Response) => {
  res.status(200).json({ publicKey: env.NEXT_PUBLIC_VAPID_PUBLIC_KEY });
};

// TEST ENDPOINT: Manually trigger a push notification to the current user
export const testPushNotification = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`[Push Test] Triggering test notification for user ${userId}`);

    await webPushService.sendPushNotification(userId, {
      title: '🧪 Test Notification',
      body: 'Jika Anda melihat ini, push notification bekerja!',
      url: '/dashboard'
    });

    res
      .status(200)
      .json({ message: 'Test push notification sent. Check your device.' });
  } catch (error) {
    console.error('[Push Test] Error:', error);
    handleError(res, error);
  }
};
