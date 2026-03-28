"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keamananAnalyticsConfig = void 0;
// features/keamanan/analytics/keamananAnalytics.ts
const models_1 = require("../../../db/models");
const models_2 = require("../../../db/models");
exports.keamananAnalyticsConfig = {
    model: models_1.KeamananLog,
    dateColumn: 'created_at',
    attributes: [
        'id',
        'device_id',
        'created_at',
        'image_url',
        'detected',
        'box',
        'confidence',
        'attributes',
        'status',
        'notes'
    ],
    getSummary: async (whereCondition, area_id, deviceWhereCondition) => {
        const includeDevice = [
            {
                model: models_2.Device,
                as: 'device',
                attributes: [],
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id
            }
        ];
        const totalDetections = await models_1.KeamananLog.count({
            where: whereCondition,
            include: includeDevice
        });
        const unacknowledged = await models_1.KeamananLog.count({
            where: { ...whereCondition, status: 'unacknowledged' },
            include: includeDevice
        });
        return {
            total_detections: totalDetections,
            unacknowledged_alerts: unacknowledged
        };
    }
};
