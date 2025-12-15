// backend/src/api/routes/telegramRoutes.ts
import { Router } from 'express';
import * as webhookController from '../controllers/telegramWebhookController';
import * as adminController from '../controllers/telegramAdminController';
import { authMiddleware, roleBasedAuth } from '../middlewares/authMiddleware';

const router = Router();

// Middleware untuk super_admin only
const superAdminOnly = roleBasedAuth(['super_admin']);

// ============================================================================
// PUBLIC ENDPOINT - Webhook dari Telegram
// ============================================================================
// PENTING: Jangan pasang authMiddleware di sini karena Telegram yang memanggil
router.post('/webhook', webhookController.handleWebhook);

// ============================================================================
// PROTECTED ENDPOINTS - Admin Management
// ============================================================================

// Generate invite link (sekali pakai, expire 10 menit)
router.post('/invite', authMiddleware, superAdminOnly, adminController.createInvite);

// Kick member dari grup Telegram
router.post('/kick', authMiddleware, superAdminOnly, adminController.kickSubscriber);

// List semua subscribers
router.get('/members', authMiddleware, superAdminOnly, adminController.getSubscribers);

// Get webhook info (debugging)
router.get('/webhook-info', authMiddleware, superAdminOnly, adminController.getWebhookInfo);

// Manual webhook setup
router.post('/setup-webhook', authMiddleware, superAdminOnly, adminController.setupWebhook);

// Send test alert
router.post('/test-alert', authMiddleware, superAdminOnly, adminController.sendTestAlert);

export default router;
