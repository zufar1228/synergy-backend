import { Router } from 'express';
import * as calibrationController from '../controllers/calibrationController';

const router = Router();

// Send command to calibration device via MQTT
router.post('/command', calibrationController.sendCommand);

// Get latest device status
router.get('/status/:deviceId', calibrationController.getStatus);

// Get raw calibration data for a session
router.get('/data/:session', calibrationController.getData);

// Get per-trial statistics
router.get('/statistics', calibrationController.getStatistics);

// Get per-session aggregate statistics
router.get('/session-stats', calibrationController.getSessionStats);

export default router;
