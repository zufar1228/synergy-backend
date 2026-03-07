import { Request, Response } from 'express';
import * as analyticsService from '../../services/analyticsService';
import ApiError from '../../utils/apiError';

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const { system_type } = req.params;
    const { area_id, from, to, status, event_type, system_state, door_state } = req.query;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const per_page = req.query.per_page
      ? parseInt(req.query.per_page as string, 10)
      : 25;

    const data = await analyticsService.getAnalyticsData({
      system_type,
      area_id: area_id as string,
      from: from as string,
      to: to as string,
      status: status as string,
      event_type: event_type as string,
      system_state: system_state as string,
      door_state: door_state as string,
      page,
      per_page
    });

    res.status(200).json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    console.error('Analytics Error:', error); // Log error tak terduga
    return res
      .status(500)
      .json({ message: 'An unexpected server error occurred.' });
  }
};
