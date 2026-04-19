/**
 * @file calibrationController.ts
 * @purpose HTTP + SSE handlers for MPU6050 calibration data collection and device control
 * @usedBy calibrationRoutes
 * @deps calibrationService, calibrationActuationService, calibrationEventBus, ApiError
 * @exports getStatus, getRawData, getSessions, getSummary, getStats, sendCommand, subscribe (SSE), getSessionStats, getTrialPeaks, getPeakSummary
 * @sideEffects DB read, SSE streaming, MQTT publish via actuation service
 */

import { Request, Response } from 'express';
import * as calibrationService from '../services/calibrationService';
import * as actuationService from '../services/calibrationActuationService';
import * as eventBus from '../services/calibrationEventBus';

const handleError = (res: Response, error: unknown) => {
  console.error('[CalibrationController] Error:', error);
  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json({ error: message });
};

/**
 * POST /api-cal/command
 * Send a calibration command to a device via MQTT
 */
export const sendCommand = async (req: Request, res: Response) => {
  try {
    const { deviceId, ...command } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }
    if (!command.cmd) {
      return res.status(400).json({ error: 'cmd is required' });
    }

    await actuationService.sendCalibrationCommand(deviceId, command);

    res.status(200).json({
      message: `Command '${command.cmd}' sent successfully`,
      device_id: deviceId,
      command: command.cmd
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/status/:deviceId
 * Get latest calibration device status
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const data = await calibrationService.getDeviceStatus(deviceId);
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/data/:session? or /api-cal/data
 * Get raw calibration data, optionally filtered by session
 */
export const getData = async (req: Request, res: Response) => {
  try {
    const session = req.params.session;
    const { trial, limit, offset } = req.query;

    const result = await calibrationService.getRawData({
      session: session || undefined,
      trial: trial ? parseInt(trial as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    });

    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/sessions
 * Get distinct session names from raw data
 */
export const getSessions = async (_req: Request, res: Response) => {
  try {
    const data = await calibrationService.getDistinctSessions();
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/summary
 * Get calibration summary data (Session A periodic summaries)
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const { session, trial, limit, offset } = req.query;
    const result = await calibrationService.getSummaryData({
      session: session as string | undefined,
      trial: trial ? parseInt(trial as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/statistics
 * Get per-trial statistics
 */
export const getStatistics = async (req: Request, res: Response) => {
  try {
    const { session } = req.query;
    const data = await calibrationService.getStatistics(session as string | undefined);
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/session-stats
 * Get per-session aggregate statistics
 */
export const getSessionStats = async (req: Request, res: Response) => {
  try {
    const data = await calibrationService.getSessionStats();
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/trial-peaks
 * Get per-trial peak Δg values
 */
export const getTrialPeaks = async (req: Request, res: Response) => {
  try {
    const { session } = req.query;
    const data = await calibrationService.getTrialPeaks(session as string | undefined);
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/peak-summary
 * Get per-session peak summary
 */
export const getPeakSummary = async (req: Request, res: Response) => {
  try {
    const data = await calibrationService.getPeakSummary();
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api-cal/events/:deviceId
 * Server-Sent Events stream for realtime calibration state updates.
 * Relays MQTT status messages from firmware with <500ms latency.
 */
export const streamEvents = async (req: Request, res: Response) => {
  const { deviceId } = req.params;

  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no' // disable nginx buffering
  });

  // Send current status from DB as initial event
  try {
    const currentStatus = await calibrationService.getDeviceStatus(deviceId);
    if (currentStatus) {
      res.write(`data: ${JSON.stringify(currentStatus)}\n\n`);
    }
  } catch {
    // Non-fatal — SSE stream still works, just no initial state
  }

  // Subscribe to live MQTT events
  const client = eventBus.subscribe(deviceId, res);

  // Cleanup on disconnect
  req.on('close', () => {
    eventBus.unsubscribe(deviceId, client);
  });
};
