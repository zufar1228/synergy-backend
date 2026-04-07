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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const calibrationController = __importStar(require("../controllers/calibrationController"));
const router = (0, express_1.Router)();
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
exports.default = router;
