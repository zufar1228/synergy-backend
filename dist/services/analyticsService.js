"use strict";
// backend/src/services/analyticsService.ts
// Core analytics dispatcher — domain-specific configs live in features/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsData = void 0;
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
// Import feature-specific analytics configs
const keamananAnalytics_1 = require("../features/keamanan/analytics/keamananAnalytics");
const intrusiAnalytics_1 = require("../features/intrusi/analytics/intrusiAnalytics");
const lingkunganAnalytics_1 = require("../features/lingkungan/analytics/lingkunganAnalytics");
// Registry of analytics configs per system type
const analyticsRegistry = {
    keamanan: keamananAnalytics_1.keamananAnalyticsConfig,
    intrusi: intrusiAnalytics_1.intrusiAnalyticsConfig,
    lingkungan: lingkunganAnalytics_1.lingkunganAnalyticsConfig
};
const getAnalyticsData = async (query) => {
    const { system_type, area_id, from, to, status, event_type, system_state, door_state } = query;
    const page = query.page || 1;
    const perPage = query.per_page || 25;
    const offset = (page - 1) * perPage;
    const config = analyticsRegistry[system_type];
    if (!config) {
        throw new apiError_1.default(400, `Invalid system_type: ${system_type}`);
    }
    const whereCondition = {};
    const deviceWhereCondition = { area_id: area_id };
    if (status)
        whereCondition.status = { [sequelize_1.Op.in]: status.split(',') };
    if (event_type)
        whereCondition.event_type = { [sequelize_1.Op.in]: event_type.split(',') };
    if (system_state)
        whereCondition.system_state = { [sequelize_1.Op.in]: system_state.split(',') };
    if (door_state)
        whereCondition.door_state = { [sequelize_1.Op.in]: door_state.split(',') };
    if (from || to) {
        whereCondition[config.dateColumn] = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    const { count, rows: data } = await config.model.findAndCountAll({
        attributes: config.attributes,
        where: whereCondition,
        include: [
            {
                model: models_1.Device,
                as: 'device',
                attributes: ['id', 'name'],
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id
            }
        ],
        limit: perPage,
        offset: offset,
        order: [[config.dateColumn, 'DESC']]
    });
    // Get domain-specific summary from feature config
    const summary = await config.getSummary(whereCondition, area_id, deviceWhereCondition);
    return {
        summary,
        logs: data,
        pagination: {
            total: count,
            page: page,
            per_page: perPage,
            total_pages: Math.ceil(count / perPage)
        }
    };
};
exports.getAnalyticsData = getAnalyticsData;
