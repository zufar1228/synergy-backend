// backend/src/api/controllers/intrusiController.ts
import { Request, Response, NextFunction } from "express";
import * as intrusiService from "../../services/intrusiService";
import { IntrusiEventClass } from "../../db/models/intrusiLog";
import ApiError from "../../utils/apiError";

// GET /api/devices/:deviceId/intrusi/logs
export const getIntrusiLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { deviceId } = req.params;
    const { limit, offset, from, to, eventClass } = req.query;

    // Parse query params
    const options = {
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      eventClass: eventClass as IntrusiEventClass | undefined,
    };

    // Validate limit
    if (options.limit > 100) {
      options.limit = 100;
    }

    const result = await intrusiService.getIntrusiLogs(deviceId, options);

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.logs.length < result.total,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/devices/:deviceId/intrusi/summary
export const getIntrusiSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { deviceId } = req.params;
    const { from, to } = req.query;

    const summary = await intrusiService.getIntrusiSummary(
      deviceId,
      from ? new Date(from as string) : undefined,
      to ? new Date(to as string) : undefined
    );

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/devices/:deviceId/intrusi/status
export const getIntrusiStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { deviceId } = req.params;

    const isInAlert = await intrusiService.isDeviceInAlertState(deviceId);
    const summary = await intrusiService.getIntrusiSummary(deviceId);

    // Determine status
    let status: "AMAN" | "GANGGUAN" | "BAHAYA" = "AMAN";
    
    if (isInAlert) {
      status = "BAHAYA";
    } else if (summary.latest_event?.event_class === "Disturbance") {
      // Check if disturbance was recent (within 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (new Date(summary.latest_event.timestamp) > fiveMinutesAgo) {
        status = "GANGGUAN";
      }
    }

    res.json({
      success: true,
      data: {
        status,
        isInAlert,
        latestEvent: summary.latest_event,
        summary: {
          total_events: summary.total_events,
          intrusions: summary.intrusions,
          disturbances: summary.disturbances,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
