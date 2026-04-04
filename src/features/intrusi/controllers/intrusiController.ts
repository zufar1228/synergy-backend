// backend/src/api/controllers/intrusiController.ts
import { Request, Response } from 'express';
import * as intrusiService from '../services/intrusiService';
import * as actuationService from '../services/actuationService';
import { type AcknowledgeStatus } from '../../../db/schema';
import ApiError from '../../../utils/apiError';

const handleError = (res: Response, error: unknown) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }
  console.error('Unhandled Error in IntrusiController:', error);
  return res
    .status(500)
    .json({ message: 'An unexpected internal server error occurred.' });
};

/**
 * GET /api/intrusi/devices/:deviceId/logs
 */
export const getLogs = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { limit, offset, from, to, event_type } = req.query;

    const result = await intrusiService.getIntrusiLogs({
      device_id: deviceId,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      from: from as string,
      to: to as string,
      event_type: event_type as string
    });

    res.status(200).json(result);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/intrusi/devices/:deviceId/summary
 */
export const getSummary = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const { from, to } = req.query;

    const data = await intrusiService.getIntrusiSummary(
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
 * GET /api/intrusi/devices/:deviceId/status
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const data = await intrusiService.getIntrusiStatus(deviceId);
    res.status(200).json({ data });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/intrusi/logs/:id/status
 */
export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, 'User tidak terautentikasi.');
    }
    const validStatuses: AcknowledgeStatus[] = [
      'unacknowledged',
      'acknowledged',
      'resolved',
      'false_alarm'
    ];
    if (!status || !validStatuses.includes(status)) {
      return res
        .status(400)
        .json({
          message:
            'Status tidak valid. Harus salah satu dari: unacknowledged, acknowledged, resolved, false_alarm.'
        });
    }

    const updatedLog = await intrusiService.updateIntrusiLogStatus(
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

/**
 * POST /api/intrusi/devices/:deviceId/command
 * Mengirim perintah ke perangkat intrusi (ARM, DISARM, SIREN_SILENCE, STATUS)
 */
export const sendCommand = async (req: Request, res: Response) => {
  try {
    const { deviceId } = req.params;
    const command = req.body; // Sudah divalidasi oleh Zod

    await actuationService.sendIntrusiCommand(
      deviceId,
      command as actuationService.IntrusiCommand
    );

    res.status(200).json({
      message: `Perintah '${command.cmd}' berhasil dikirim.`,
      device_id: deviceId,
      command: command.cmd
    });
  } catch (error) {
    handleError(res, error);
  }
};
