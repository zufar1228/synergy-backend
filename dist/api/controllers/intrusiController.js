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
exports.getIntrusiStatus = exports.getIntrusiSummary = exports.getIntrusiLogs = void 0;
const intrusiService = __importStar(require("../../services/intrusiService"));
// GET /api/devices/:deviceId/intrusi/logs
const getIntrusiLogs = async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { limit, offset, from, to, eventClass } = req.query;
        // Parse query params
        const options = {
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0,
            from: from ? new Date(from) : undefined,
            to: to ? new Date(to) : undefined,
            eventClass: eventClass,
        };
        // Validate limit
        if (options.limit > 100) {
            options.limit = 100;
        }
        const result = await intrusiService.getIntrusiLogs(deviceId, options);
        res.json({
            success: true,
            data: result.logs,
            pagination: {
                total: result.total,
                limit: result.limit,
                offset: result.offset,
                hasMore: result.offset + result.logs.length < result.total,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getIntrusiLogs = getIntrusiLogs;
// GET /api/devices/:deviceId/intrusi/summary
const getIntrusiSummary = async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { from, to } = req.query;
        const summary = await intrusiService.getIntrusiSummary(deviceId, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
        res.json({
            success: true,
            data: summary,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getIntrusiSummary = getIntrusiSummary;
// GET /api/devices/:deviceId/intrusi/status
const getIntrusiStatus = async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const isInAlert = await intrusiService.isDeviceInAlertState(deviceId);
        const summary = await intrusiService.getIntrusiSummary(deviceId);
        // Determine status
        let status = "AMAN";
        if (isInAlert) {
            status = "BAHAYA";
        }
        else if (summary.latest_event?.event_class === "Disturbance") {
            // Check if disturbance was recent (within 5 minutes)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (new Date(summary.latest_event.timestamp) > fiveMinutesAgo) {
                status = "GANGGUAN";
            }
        }
        res.json({
            success: true,
            data: {
                status,
                isInAlert,
                latestEvent: summary.latest_event,
                summary: {
                    total_events: summary.total_events,
                    intrusions: summary.intrusions,
                    disturbances: summary.disturbances,
                },
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getIntrusiStatus = getIntrusiStatus;
