/**
 * @file calibrationRoutes.ts
 * @purpose Express router for calibration endpoints (data, sessions, SSE, commands)
 * @usedBy server.ts
 * @deps calibrationController, authMiddleware
 * @exports default router
 * @sideEffects None
 */

import { Router } from 'express';
import * as calibrationController from '../controllers/calibrationController';

const router = Router();

// Send command to calibration device via MQTT
router.post('/command', calibrationController.sendCommand);

// SSE stream for realtime device state (MQTT relay, <500ms latency)
router.get('/events/:deviceId', calibrationController.streamEvents);

// Get latest device status
router.get('/status/:deviceId', calibrationController.getStatus);

// Get distinct session names (must be before /data/:session to avoid conflict)
router.get('/sessions', calibrationController.getSessions);

// Get raw calibration data (all sessions)
router.get('/data', calibrationController.getData);

// Get raw calibration data (filtered by session)
router.get('/data/:session', calibrationController.getData);

// Get summary data (Session A periodic summaries)
router.get('/summary', calibrationController.getSummary);

// Get per-trial statistics
router.get('/statistics', calibrationController.getStatistics);

// Get per-session aggregate statistics
router.get('/session-stats', calibrationController.getSessionStats);

// Get per-trial peak Δg values
router.get('/trial-peaks', calibrationController.getTrialPeaks);

// Get per-session peak summary
router.get('/peak-summary', calibrationController.getPeakSummary);

export default router;
