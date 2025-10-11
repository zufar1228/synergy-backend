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
exports.getIncidentTrendByWarehouse = exports.getIncidentSummaryByType = exports.getAnalytics = void 0;
const analyticsService = __importStar(require("../../services/analyticsService"));
const apiError_1 = __importDefault(require("../../utils/apiError"));
const getAnalytics = async (req, res) => {
    try {
        const { system_type } = req.params;
        const { area_id, from, to } = req.query;
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const per_page = req.query.per_page
            ? parseInt(req.query.per_page, 10)
            : 25;
        const data = await analyticsService.getAnalyticsData({
            system_type,
            area_id: area_id,
            from: from,
            to: to,
            page,
            per_page,
        });
        res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Analytics Error:", error); // Log error tak terduga
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.getAnalytics = getAnalytics;
const getIncidentSummaryByType = async (req, res) => {
    try {
        const { area_id, from, to } = req.query;
        const data = await analyticsService.getIncidentSummaryByType({
            area_id: area_id,
            from: from,
            to: to,
        });
        res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Analytics Error:", error); // Log error tak terduga
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.getIncidentSummaryByType = getIncidentSummaryByType;
const getIncidentTrendByWarehouse = async (req, res) => {
    try {
        const { warehouse_id, from, to } = req.query;
        if (!warehouse_id) {
            return res
                .status(400)
                .json({ message: 'Query parameter "warehouse_id" is required.' });
        }
        const data = await analyticsService.getIncidentTrendByWarehouse({
            warehouse_id: warehouse_id,
            from: from,
            to: to,
        });
        res.status(200).json(data);
    }
    catch (error) {
        if (error instanceof apiError_1.default) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Analytics Error:", error); // Log error tak terduga
        return res
            .status(500)
            .json({ message: "An unexpected server error occurred." });
    }
};
exports.getIncidentTrendByWarehouse = getIncidentTrendByWarehouse;
