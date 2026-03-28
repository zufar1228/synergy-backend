"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lingkunganAnalyticsConfig = void 0;
// features/lingkungan/analytics/lingkunganAnalytics.ts
const models_1 = require("../../../db/models");
const models_2 = require("../../../db/models");
exports.lingkunganAnalyticsConfig = {
    model: models_1.LingkunganLog,
    dateColumn: 'timestamp',
    attributes: [
        'id',
        'device_id',
        'timestamp',
        'temperature',
        'humidity',
        'co2',
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
        const totalReadings = await models_1.LingkunganLog.count({
            where: whereCondition,
            include: includeDevice
        });
        const unacknowledgedLingkungan = await models_1.LingkunganLog.count({
            where: { ...whereCondition, status: 'unacknowledged' },
            include: includeDevice
        });
        return {
            total_readings: totalReadings,
            unacknowledged: unacknowledgedLingkungan
        };
    }
};
