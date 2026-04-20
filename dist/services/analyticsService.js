"use strict";
/**
 * @file analyticsService.ts
 * @purpose Analytics data aggregation dispatcher — delegates to per-system analytics configs
 * @usedBy analyticsController
 * @deps keamananAnalytics, intrusiAnalytics, lingkunganAnalytics, ApiError
 * @exports AnalyticsQuery, AnalyticsConfig, getAnalyticsData
 * @sideEffects DB read (delegated to feature analytics)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsData = void 0;
const apiError_1 = __importDefault(require("../utils/apiError"));
const keamananAnalytics_1 = require("../features/keamanan/analytics/keamananAnalytics");
const intrusiAnalytics_1 = require("../features/intrusi/analytics/intrusiAnalytics");
const lingkunganAnalytics_1 = require("../features/lingkungan/analytics/lingkunganAnalytics");
const analyticsRegistry = {
    keamanan: keamananAnalytics_1.keamananAnalyticsConfig,
    intrusi: intrusiAnalytics_1.intrusiAnalyticsConfig,
    lingkungan: lingkunganAnalytics_1.lingkunganAnalyticsConfig
};
const getAnalyticsData = async (query) => {
    const { system_type } = query;
    const page = query.page || 1;
    const perPage = query.per_page || 25;
    const offset = (page - 1) * perPage;
    const config = analyticsRegistry[system_type];
    if (!config) {
        throw new apiError_1.default(400, `Invalid system_type: ${system_type}`);
    }
    const { count, data } = await config.getLogsAndCount(query, perPage, offset);
    const summary = await config.getSummary(query);
    return {
        summary,
        logs: data,
        pagination: {
            total: count,
            page,
            per_page: perPage,
            total_pages: Math.ceil(count / perPage)
        }
    };
};
exports.getAnalyticsData = getAnalyticsData;
