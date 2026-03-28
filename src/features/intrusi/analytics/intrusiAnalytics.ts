// features/intrusi/analytics/intrusiAnalytics.ts
import { IntrusiLog } from '../../../db/models';
import { Device } from '../../../db/models';
import { Op } from 'sequelize';
import type { AnalyticsConfig } from '../../../services/analyticsService';

export const intrusiAnalyticsConfig: AnalyticsConfig = {
  model: IntrusiLog,
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
        model: Device,
        as: 'device',
        attributes: [],
        where: area_id ? deviceWhereCondition : undefined,
        required: !!area_id
      }
    ];

    const totalEvents = await IntrusiLog.count({
      where: whereCondition,
      include: includeDevice
    });

    const alarmEvents = await IntrusiLog.count({
      where: {
        ...whereCondition,
        event_type: { [Op.in]: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'] }
      },
      include: includeDevice
    });

    const impactWarnings = await IntrusiLog.count({
      where: {
        ...whereCondition,
        event_type: 'IMPACT_WARNING'
      },
      include: includeDevice
    });

    const unacknowledgedIntrusi = await IntrusiLog.count({
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
