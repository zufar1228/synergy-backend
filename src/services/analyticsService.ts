import ApiError from '../utils/apiError';

import { keamananAnalyticsConfig } from '../features/keamanan/analytics/keamananAnalytics';
import { intrusiAnalyticsConfig } from '../features/intrusi/analytics/intrusiAnalytics';
import { lingkunganAnalyticsConfig } from '../features/lingkungan/analytics/lingkunganAnalytics';

export interface AnalyticsQuery {
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

export interface AnalyticsConfig {
  getLogsAndCount: (
    query: AnalyticsQuery,
    limit: number,
    offset: number
  ) => Promise<{ count: number; data: any[] }>;
  getSummary: (query: AnalyticsQuery) => Promise<object>;
}

const analyticsRegistry: { [key: string]: AnalyticsConfig } = {
  keamanan: keamananAnalyticsConfig,
  intrusi: intrusiAnalyticsConfig,
  lingkungan: lingkunganAnalyticsConfig
};

export const getAnalyticsData = async (query: AnalyticsQuery) => {
  const { system_type } = query;
  const page = query.page || 1;
  const perPage = query.per_page || 25;
  const offset = (page - 1) * perPage;

  const config = analyticsRegistry[system_type];
  if (!config) {
    throw new ApiError(400, `Invalid system_type: ${system_type}`);
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
