// features/keamanan/analytics/keamananAnalytics.ts
import { KeamananLog } from '../../../db/models';
import { Device } from '../../../db/models';
import type { AnalyticsConfig } from '../../../services/analyticsService';

export const keamananAnalyticsConfig: AnalyticsConfig = {
  model: KeamananLog,
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
        model: Device,
        as: 'device',
        attributes: [],
        where: area_id ? deviceWhereCondition : undefined,
        required: !!area_id
      }
    ];

    const totalDetections = await KeamananLog.count({
      where: whereCondition,
      include: includeDevice
    });

    const unacknowledged = await KeamananLog.count({
      where: { ...whereCondition, status: 'unacknowledged' },
      include: includeDevice
    });

    return {
      total_detections: totalDetections,
      unacknowledged_alerts: unacknowledged
    };
  }
};
