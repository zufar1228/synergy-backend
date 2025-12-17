// backend/src/services/proteksiAsetService.ts

import { Op } from "sequelize";
import ProteksiAsetLog, { IncidentType } from "../db/models/proteksiAsetLog";
import { Device } from "../db/models";

// URL untuk ML Model API (dari environment variable)
const ML_MODEL_URL = process.env.ML_MODEL_URL || "http://localhost:5001";

// Tipe data sensor mentah dari MQTT
export interface RawSensorData {
  sensorId: string;
  type: "vibration" | "thermal" | "water";
  data: {
    accX?: number;
    accY?: number;
    accZ?: number;
    gyroX?: number;
    gyroY?: number;
    gyroZ?: number;
    mic_level?: number;
    thermal_data?: number[];
    water_level?: number;
  };
}

// Response dari ML API
interface MLPredictionResponse {
  prediction: "IMPACT" | "VIBRATION" | "NORMAL";
  confidence: number;
}

// Threshold untuk deteksi bahaya
const THERMAL_THRESHOLD = parseFloat(process.env.THERMAL_THRESHOLD || "35");
const WATER_THRESHOLD = parseInt(process.env.WATER_THRESHOLD || "500");

/**
 * Validasi payload sensor proteksi aset
 */
export const validateProteksiAsetPayload = (
  payload: unknown
): { valid: boolean; error?: string } => {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Payload harus berupa objek" };
  }

  const data = payload as Record<string, unknown>;

  if (!data.sensorId || typeof data.sensorId !== "string") {
    return { valid: false, error: "sensorId wajib diisi dan berupa string" };
  }

  if (!data.type || !["vibration", "thermal", "water"].includes(data.type as string)) {
    return { valid: false, error: "type harus salah satu dari: vibration, thermal, water" };
  }

  if (!data.data || typeof data.data !== "object") {
    return { valid: false, error: "data wajib diisi dan berupa objek" };
  }

  return { valid: true };
};

/**
 * Proses data sensor dengan ML API (untuk vibration/impact)
 */
export const processSensorDataWithML = async (
  rawData: RawSensorData
): Promise<{ incident_type: IncidentType; confidence: number | null; shouldSave: boolean }> => {
  // Untuk tipe thermal dan water, proses lokal tanpa ML
  if (rawData.type === "thermal") {
    return processThermalData(rawData);
  }

  if (rawData.type === "water") {
    return processWaterData(rawData);
  }

  // Untuk vibration, kirim ke ML API
  try {
    const response = await fetch(`${ML_MODEL_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawData.data),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`ML API Error - Status: ${response.status}, Body: ${errorBody}`);
      throw new Error("ML model API returned an error");
    }

    const predictionResult = (await response.json()) as MLPredictionResponse;

    // Hanya simpan jika bukan NORMAL
    if (predictionResult.prediction !== "NORMAL") {
      return {
        incident_type: predictionResult.prediction,
        confidence: predictionResult.confidence,
        shouldSave: true,
      };
    }

    return {
      incident_type: "NORMAL",
      confidence: predictionResult.confidence,
      shouldSave: false,
    };
  } catch (error) {
    console.error("Error processing data with ML model:", error);
    // Fallback: simpan sebagai NORMAL tanpa ML
    return {
      incident_type: "NORMAL",
      confidence: null,
      shouldSave: false,
    };
  }
};

/**
 * Proses data thermal (suhu)
 */
const processThermalData = (
  rawData: RawSensorData
): { incident_type: IncidentType; confidence: number | null; shouldSave: boolean } => {
  const thermalData = rawData.data.thermal_data;

  if (!thermalData || !Array.isArray(thermalData) || thermalData.length === 0) {
    return { incident_type: "NORMAL", confidence: null, shouldSave: false };
  }

  const avg = thermalData.reduce((a, b) => a + b, 0) / thermalData.length;
  const max = Math.max(...thermalData);

  // Deteksi suhu tinggi
  if (avg > THERMAL_THRESHOLD) {
    // Confidence berdasarkan seberapa jauh dari threshold
    const confidence = Math.min(1, (avg - THERMAL_THRESHOLD) / 20);
    return {
      incident_type: "THERMAL",
      confidence,
      shouldSave: true,
    };
  }

  return { incident_type: "NORMAL", confidence: null, shouldSave: false };
};

/**
 * Proses data water leak
 */
const processWaterData = (
  rawData: RawSensorData
): { incident_type: IncidentType; confidence: number | null; shouldSave: boolean } => {
  const waterLevel = rawData.data.water_level;

  if (waterLevel === undefined || waterLevel === null) {
    return { incident_type: "NORMAL", confidence: null, shouldSave: false };
  }

  // Deteksi kebocoran air
  if (waterLevel > WATER_THRESHOLD) {
    // Confidence berdasarkan level air
    const confidence = Math.min(1, (waterLevel - WATER_THRESHOLD) / 3000);
    return {
      incident_type: "WATER_LEAK",
      confidence,
      shouldSave: true,
    };
  }

  return { incident_type: "NORMAL", confidence: null, shouldSave: false };
};

/**
 * Buat log insiden baru
 */
export const createLog = async (
  deviceId: string,
  incidentType: IncidentType,
  confidence: number | null,
  rawData: RawSensorData
): Promise<ProteksiAsetLog> => {
  // Ekstrak raw_values berdasarkan tipe sensor
  let raw_values: Record<string, number | undefined> = {};

  if (rawData.type === "vibration") {
    raw_values = {
      accX: rawData.data.accX,
      accY: rawData.data.accY,
      accZ: rawData.data.accZ,
      gyroX: rawData.data.gyroX,
      gyroY: rawData.data.gyroY,
      gyroZ: rawData.data.gyroZ,
      mic_level: rawData.data.mic_level,
    };
  } else if (rawData.type === "thermal" && rawData.data.thermal_data) {
    const thermalData = rawData.data.thermal_data;
    raw_values = {
      thermal_avg: thermalData.reduce((a, b) => a + b, 0) / thermalData.length,
      thermal_max: Math.max(...thermalData),
    };
  } else if (rawData.type === "water") {
    raw_values = {
      water_level: rawData.data.water_level,
    };
  }

  const log = await ProteksiAsetLog.create({
    device_id: deviceId,
    incident_type: incidentType,
    confidence,
    data: { raw_values },
  });

  // Update last_heartbeat pada device
  await Device.update(
    { last_heartbeat: new Date(), status: "Online" as const },
    { where: { id: deviceId } }
  );

  return log;
};

/**
 * Ambil log berdasarkan device dengan pagination
 */
export const getLogsByDevice = async (
  deviceId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: ProteksiAsetLog[]; total: number }> => {
  const { startDate, endDate, limit = 100, offset = 0 } = options;

  const whereClause: any = { device_id: deviceId };

  if (startDate || endDate) {
    whereClause.timestamp = {};
    if (startDate) whereClause.timestamp[Op.gte] = startDate;
    if (endDate) whereClause.timestamp[Op.lte] = endDate;
  }

  const { count, rows } = await ProteksiAsetLog.findAndCountAll({
    where: whereClause,
    order: [["timestamp", "DESC"]],
    limit,
    offset,
  });

  return { logs: rows, total: count };
};

/**
 * Ambil log berdasarkan area
 */
export const getLogsByArea = async (
  areaId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: ProteksiAsetLog[]; total: number }> => {
  const { startDate, endDate, limit = 100, offset = 0 } = options;

  // Cari semua device di area ini
  const devices = await Device.findAll({
    where: { area_id: areaId, system_type: "proteksi_aset" },
    attributes: ["id"],
  });

  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    return { logs: [], total: 0 };
  }

  const whereClause: any = {
    device_id: { [Op.in]: deviceIds },
  };

  if (startDate || endDate) {
    whereClause.timestamp = {};
    if (startDate) whereClause.timestamp[Op.gte] = startDate;
    if (endDate) whereClause.timestamp[Op.lte] = endDate;
  }

  const { count, rows } = await ProteksiAsetLog.findAndCountAll({
    where: whereClause,
    order: [["timestamp", "DESC"]],
    limit,
    offset,
  });

  return { logs: rows, total: count };
};

/**
 * Ambil statistik untuk chart (24 jam terakhir)
 */
export const getStatsForChart = async (
  areaId: string
): Promise<{ time: string; vibration: number; sound: number }[]> => {
  // Cari semua device di area ini
  const devices = await Device.findAll({
    where: { area_id: areaId, system_type: "proteksi_aset" },
    attributes: ["id"],
  });

  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    return [];
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const logs = await ProteksiAsetLog.findAll({
    where: {
      device_id: { [Op.in]: deviceIds },
      timestamp: { [Op.gte]: oneDayAgo },
    },
    order: [["timestamp", "ASC"]],
  });

  return logs.map((log) => {
    const rawValues = (log.data as { raw_values?: Record<string, number> })?.raw_values || {};
    return {
      time: log.timestamp.toISOString(),
      vibration: rawValues.accX || 0,
      sound: rawValues.mic_level || 0,
    };
  });
};

/**
 * Ambil ringkasan insiden
 */
export const getSummary = async (
  areaId: string
): Promise<{ totalIncidents: number; activeIncidents: number }> => {
  // Cari semua device di area ini
  const devices = await Device.findAll({
    where: { area_id: areaId, system_type: "proteksi_aset" },
    attributes: ["id"],
  });

  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    return { totalIncidents: 0, activeIncidents: 0 };
  }

  const whereClause = { device_id: { [Op.in]: deviceIds } };

  const totalIncidents = await ProteksiAsetLog.count({ where: whereClause });

  const activeIncidents = await ProteksiAsetLog.count({
    where: { ...whereClause, is_cleared: false },
  });

  return { totalIncidents, activeIncidents };
};

/**
 * Clear (acknowledge) insiden
 */
export const clearIncident = async (incidentId: string): Promise<ProteksiAsetLog | null> => {
  const log = await ProteksiAsetLog.findByPk(incidentId);

  if (!log) {
    return null;
  }

  log.is_cleared = true;
  await log.save();

  return log;
};

/**
 * Ambil status terkini area
 */
export const getCurrentStatus = async (
  areaId: string
): Promise<{ status: "AMAN" | "WASPADA" | "BAHAYA"; lastIncident: ProteksiAsetLog | null }> => {
  // Cari semua device di area ini
  const devices = await Device.findAll({
    where: { area_id: areaId, system_type: "proteksi_aset" },
    attributes: ["id"],
  });

  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    return { status: "AMAN", lastIncident: null };
  }

  // Cari insiden aktif terbaru
  const lastActiveIncident = await ProteksiAsetLog.findOne({
    where: {
      device_id: { [Op.in]: deviceIds },
      is_cleared: false,
      incident_type: { [Op.ne]: "NORMAL" },
    },
    order: [["timestamp", "DESC"]],
  });

  if (!lastActiveIncident) {
    return { status: "AMAN", lastIncident: null };
  }

  // Tentukan status berdasarkan tipe insiden
  const dangerTypes: IncidentType[] = ["IMPACT", "WATER_LEAK"];
  const warningTypes: IncidentType[] = ["VIBRATION", "THERMAL"];

  let status: "AMAN" | "WASPADA" | "BAHAYA" = "AMAN";

  if (dangerTypes.includes(lastActiveIncident.incident_type)) {
    status = "BAHAYA";
  } else if (warningTypes.includes(lastActiveIncident.incident_type)) {
    status = "WASPADA";
  }

  return { status, lastIncident: lastActiveIncident };
};
