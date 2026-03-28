// features/lingkungan/analytics/lingkunganAnalytics.ts
import { LingkunganLog } from '../../../db/models';
import { Device } from '../../../db/models';
import type { AnalyticsConfig } from '../../../services/analyticsService';

export const lingkunganAnalyticsConfig: AnalyticsConfig = {
  model: LingkunganLog,
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
        model: Device,
        as: 'device',
        attributes: [],
        where: area_id ? deviceWhereCondition : undefined,
        required: !!area_id
      }
    ];

    const totalReadings = await LingkunganLog.count({
      where: whereCondition,
      include: includeDevice
    });

    const unacknowledgedLingkungan = await LingkunganLog.count({
      where: { ...whereCondition, status: 'unacknowledged' },
      include: includeDevice
    });

    return {
      total_readings: totalReadings,
      unacknowledged: unacknowledgedLingkungan
    };
  }
};
