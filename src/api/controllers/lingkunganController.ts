// backend/src/api/controllers/lingkunganController.ts
import { Request, Response } from 'express';
import * as lingkunganService from '../../services/lingkunganService';
import { AcknowledgeStatus } from '../../db/models/lingkunganLog';
import ApiError from '../../utils/apiError';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error('Unhandled Error in LingkunganController:', error);
  return res
    .status(500)
    .json({ message: 'An unexpected internal server error occurred.' });
};

/**
 * GET /api/lingkungan/devices/:deviceId/logs
 */
export const getLogs = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { limit, offset, from, to } = req.query;

    const result = await lingkunganService.getLingkunganLogs({
      device_id: deviceId,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      from: from as string,
      to: to as string
    });

    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/lingkungan/devices/:deviceId/summary
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { from, to } = req.query;

    const data = await lingkunganService.getLingkunganSummary(
      deviceId,
      from as string,
      to as string
    );

    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/lingkungan/devices/:deviceId/status
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const data = await lingkunganService.getLingkunganStatus(deviceId);
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/lingkungan/devices/:deviceId/chart
 */
export const getChartData = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { from, to, limit } = req.query;

    console.log('[LingkunganController.getChartData]', {
      deviceId,
      from,
      to,
      limit,
      limitType: typeof limit
    });

    const data = await lingkunganService.getChartData(
      deviceId,
      from as string,
      to as string,
      limit ? parseInt(limit as string, 10) : undefined
    );

    console.log('[LingkunganController.getChartData] Sending response:', {
      actualCount: data.actual.length,
      predictionCount: data.predictions.length
    });

    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/lingkungan/control
 * Manual control endpoint — sends fan/dehumidifier commands via MQTT.
 */
export const sendControlCommand = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { fan, dehumidifier, mode } = req.body;

    // If switching to auto mode
    if (mode === 'AUTO') {
      await lingkunganService.switchToAutoMode(deviceId);
      return res.status(200).json({
        message: 'Beralih ke mode otomatis.',
        device_id: deviceId,
        mode: 'AUTO'
      });
    }

    // Manual control (Level 1 — highest priority)
    const command: { fan?: string; dehumidifier?: string } = {};
    if (fan) command.fan = fan;
    if (dehumidifier) command.dehumidifier = dehumidifier;

    await lingkunganService.handleManualControl(deviceId, command);

    res.status(200).json({
      message: `Perintah manual berhasil dikirim.`,
      device_id: deviceId,
      command,
      mode: 'MANUAL',
      override_duration: '5 menit'
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/lingkungan/logs/:id/status
 */
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, 'User tidak terautentikasi.');
    }
    if (!status) {
      return res.status(400).json({ message: 'Status wajib diisi.' });
    }

    const updatedLog = await lingkunganService.updateLingkunganLogStatus(
      id,
      userId,
      status as AcknowledgeStatus,
      notes
    );
    res.status(200).json(updatedLog);
  } catch (error) {
    handleError(res, error);
  }
};
