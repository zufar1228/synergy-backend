import { Router } from 'express';
import * as calibrationController from '../controllers/calibrationController';

const router = Router();

// Send command to calibration device via MQTT
router.post('/command', calibrationController.sendCommand);

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

export default router;
