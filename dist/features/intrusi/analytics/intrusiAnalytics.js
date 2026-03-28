"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intrusiAnalyticsConfig = void 0;
// features/intrusi/analytics/intrusiAnalytics.ts
const models_1 = require("../../../db/models");
const models_2 = require("../../../db/models");
const sequelize_1 = require("sequelize");
exports.intrusiAnalyticsConfig = {
    model: models_1.IntrusiLog,
    dateColumn: 'timestamp',
    attributes: [
        'id',
        'device_id',
        'timestamp',
        'event_type',
        'system_state',
        'door_state',
        'peak_delta_g',
        'hit_count',
        'payload',
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
        const totalEvents = await models_1.IntrusiLog.count({
            where: whereCondition,
            include: includeDevice
        });
        const alarmEvents = await models_1.IntrusiLog.count({
            where: {
                ...whereCondition,
                event_type: { [sequelize_1.Op.in]: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'] }
            },
            include: includeDevice
        });
        const impactWarnings = await models_1.IntrusiLog.count({
            where: {
                ...whereCondition,
                event_type: 'IMPACT_WARNING'
            },
            include: includeDevice
        });
        const unacknowledgedIntrusi = await models_1.IntrusiLog.count({
            where: { ...whereCondition, status: 'unacknowledged' },
            include: includeDevice
        });
        return {
            total_events: totalEvents,
            alarm_events: alarmEvents,
            impact_warnings: impactWarnings,
            unacknowledged: unacknowledgedIntrusi
        };
    }
};
