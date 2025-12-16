// backend/src/services/intrusiService.ts
// Service untuk menangani operasi terkait Intrusion Detection (TinyML)

import { IntrusiLog, Device, Area, Warehouse } from "../db/models";
import { IntrusiEventClass } from "../db/models/intrusiLog";
import { Op } from "sequelize";

// Validation schema for TinyML payload
interface TinyMLPayload {
  event: IntrusiEventClass;
  conf: number;
  ts?: string;
}

// Validate incoming TinyML payload
export const validateTinyMLPayload = (data: any): TinyMLPayload | null => {
  // Validate event class
  const validEvents: IntrusiEventClass[] = ["Normal", "Disturbance", "Intrusion"];
  if (!data.event || !validEvents.includes(data.event)) {
    console.error(`[IntrusiService] Invalid event class: ${data.event}`);
    return null;
  }

  // Validate confidence (0.0 - 1.0)
  const conf = parseFloat(data.conf);
  if (isNaN(conf) || conf < 0 || conf > 1) {
    console.error(`[IntrusiService] Invalid confidence: ${data.conf}`);
    return null;
  }

  return {
    event: data.event,
    conf: conf,
    ts: data.ts,
  };
};

// Save intrusion log to database
export const saveIntrusiLog = async (
  deviceId: string,
  payload: TinyMLPayload
): Promise<IntrusiLog | null> => {
  try {
    const log = await IntrusiLog.create({
      device_id: deviceId,
      event_class: payload.event,
      confidence: payload.conf,
      payload: payload as any,
      timestamp: payload.ts ? new Date(payload.ts) : new Date(),
    });

    console.log(
      `[IntrusiService] ✅ Saved: ${payload.event} (${(payload.conf * 100).toFixed(1)}%)`
    );
    return log;
  } catch (error) {
    console.error("[IntrusiService] ❌ Error saving log:", error);
    return null;
  }
};

// Get device with relations for alerting
export const getDeviceWithRelations = async (deviceId: string) => {
  try {
    const device = await Device.findByPk(deviceId, {
      include: [
        {
          model: Area,
          as: "area",
          include: [{ model: Warehouse, as: "warehouse" }],
        },
      ],
    });
    return device;
  } catch (error) {
    console.error("[IntrusiService] ❌ Error fetching device:", error);
    return null;
  }
};

// Get intrusion logs for a device with pagination
export const getIntrusiLogs = async (
  deviceId: string,
  options: {
    limit?: number;
    offset?: number;
    from?: Date;
    to?: Date;
    eventClass?: IntrusiEventClass;
  } = {}
) => {
  const { limit = 50, offset = 0, from, to, eventClass } = options;

  const whereClause: any = { device_id: deviceId };

  if (from || to) {
    whereClause.timestamp = {};
    if (from) whereClause.timestamp[Op.gte] = from;
    if (to) whereClause.timestamp[Op.lte] = to;
  }

  if (eventClass) {
    whereClause.event_class = eventClass;
  }

  try {
    const { rows: logs, count: total } = await IntrusiLog.findAndCountAll({
      where: whereClause,
      order: [["timestamp", "DESC"]],
      limit,
      offset,
    });

    return { logs, total, limit, offset };
  } catch (error) {
    console.error("[IntrusiService] ❌ Error fetching logs:", error);
    return { logs: [], total: 0, limit, offset };
  }
};

// Get summary statistics for a device
export const getIntrusiSummary = async (
  deviceId: string,
  from?: Date,
  to?: Date
) => {
  const whereClause: any = { device_id: deviceId };

  if (from || to) {
    whereClause.timestamp = {};
    if (from) whereClause.timestamp[Op.gte] = from;
    if (to) whereClause.timestamp[Op.lte] = to;
  }

  try {
    const totalEvents = await IntrusiLog.count({ where: whereClause });

    const intrusions = await IntrusiLog.count({
      where: { ...whereClause, event_class: "Intrusion" },
    });

    const disturbances = await IntrusiLog.count({
      where: { ...whereClause, event_class: "Disturbance" },
    });

    const normals = await IntrusiLog.count({
      where: { ...whereClause, event_class: "Normal" },
    });

    // Get latest event
    const latestEvent = await IntrusiLog.findOne({
      where: { device_id: deviceId },
      order: [["timestamp", "DESC"]],
    });

    return {
      total_events: totalEvents,
      intrusions,
      disturbances,
      normals,
      latest_event: latestEvent,
    };
  } catch (error) {
    console.error("[IntrusiService] ❌ Error fetching summary:", error);
    return {
      total_events: 0,
      intrusions: 0,
      disturbances: 0,
      normals: 0,
      latest_event: null,
    };
  }
};

// Check if device is in alert state (recent intrusion)
export const isDeviceInAlertState = async (
  deviceId: string,
  minutesThreshold: number = 5
): Promise<boolean> => {
  try {
    const thresholdTime = new Date(Date.now() - minutesThreshold * 60 * 1000);

    const recentIntrusion = await IntrusiLog.findOne({
      where: {
        device_id: deviceId,
        event_class: "Intrusion",
        timestamp: { [Op.gte]: thresholdTime },
      },
    });

    return recentIntrusion !== null;
  } catch (error) {
    console.error("[IntrusiService] ❌ Error checking alert state:", error);
    return false;
  }
};
