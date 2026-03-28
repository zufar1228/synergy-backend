// backend/src/services/analyticsService.ts
// Core analytics dispatcher — domain-specific configs live in features/

import { Device } from '../db/models';
import ApiError from '../utils/apiError';
import { Op, ModelStatic, Model, Includeable } from 'sequelize';

// Registry type that each feature provides
export interface AnalyticsConfig {
  model: ModelStatic<Model<any, any>>;
  dateColumn: string;
  attributes: string[];
  getSummary: (
    whereCondition: any,
    area_id: string | undefined,
    deviceWhereCondition: any
  ) => Promise<object>;
}

// Import feature-specific analytics configs
import { keamananAnalyticsConfig } from '../features/keamanan/analytics/keamananAnalytics';
import { intrusiAnalyticsConfig } from '../features/intrusi/analytics/intrusiAnalytics';
import { lingkunganAnalyticsConfig } from '../features/lingkungan/analytics/lingkunganAnalytics';

// Registry of analytics configs per system type
const analyticsRegistry: { [key: string]: AnalyticsConfig } = {
  keamanan: keamananAnalyticsConfig,
  intrusi: intrusiAnalyticsConfig,
  lingkungan: lingkunganAnalyticsConfig
};

interface AnalyticsQuery {
  system_type: string;
  area_id?: string;
  page?: number;
  per_page?: number;
  from?: string;
  to?: string;
  status?: string;
  event_type?: string;
  system_state?: string;
  door_state?: string;
}

export const getAnalyticsData = async (query: AnalyticsQuery) => {
  const { system_type, area_id, from, to, status, event_type, system_state, door_state } = query;
  const page = query.page || 1;
  const perPage = query.per_page || 25;
  const offset = (page - 1) * perPage;

  const config = analyticsRegistry[system_type];
  if (!config) {
    throw new ApiError(400, `Invalid system_type: ${system_type}`);
  }

  const whereCondition: any = {};
  const deviceWhereCondition: any = { area_id: area_id };

  if (status) whereCondition.status = { [Op.in]: status.split(',') };
  if (event_type) whereCondition.event_type = { [Op.in]: event_type.split(',') };
  if (system_state) whereCondition.system_state = { [Op.in]: system_state.split(',') };
  if (door_state) whereCondition.door_state = { [Op.in]: door_state.split(',') };

  if (from || to) {
    whereCondition[config.dateColumn] = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) })
    };
  }

  const { count, rows: data } = await config.model.findAndCountAll({
    attributes: config.attributes,
    where: whereCondition,
    include: [
      {
        model: Device,
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
