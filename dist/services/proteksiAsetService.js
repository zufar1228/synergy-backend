"use strict";
// backend/src/services/proteksiAsetService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentStatus = exports.clearIncident = exports.getSummary = exports.getStatsForChart = exports.getLogsByArea = exports.getLogsByDevice = exports.createLog = exports.processSensorDataWithML = exports.validateProteksiAsetPayload = void 0;
const sequelize_1 = require("sequelize");
const proteksiAsetLog_1 = __importDefault(require("../db/models/proteksiAsetLog"));
const models_1 = require("../db/models");
// URL untuk ML Model API (dari environment variable)
const ML_MODEL_URL = process.env.ML_MODEL_URL || "http://localhost:5001";
// Threshold untuk deteksi bahaya
const THERMAL_THRESHOLD = parseFloat(process.env.THERMAL_THRESHOLD || "35");
const WATER_THRESHOLD = parseInt(process.env.WATER_THRESHOLD || "500");
/**
 * Validasi payload sensor proteksi aset
 */
const validateProteksiAsetPayload = (payload) => {
    if (!payload || typeof payload !== "object") {
        return { valid: false, error: "Payload harus berupa objek" };
    }
    const data = payload;
    if (!data.sensorId || typeof data.sensorId !== "string") {
        return { valid: false, error: "sensorId wajib diisi dan berupa string" };
    }
    if (!data.type || !["vibration", "thermal", "water"].includes(data.type)) {
        return { valid: false, error: "type harus salah satu dari: vibration, thermal, water" };
    }
    if (!data.data || typeof data.data !== "object") {
        return { valid: false, error: "data wajib diisi dan berupa objek" };
    }
    return { valid: true };
};
exports.validateProteksiAsetPayload = validateProteksiAsetPayload;
/**
 * Proses data sensor dengan ML API (untuk vibration/impact)
 */
const processSensorDataWithML = async (rawData) => {
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
        const predictionResult = (await response.json());
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
    }
    catch (error) {
        console.error("Error processing data with ML model:", error);
        // Fallback: simpan sebagai NORMAL tanpa ML
        return {
            incident_type: "NORMAL",
            confidence: null,
            shouldSave: false,
        };
    }
};
exports.processSensorDataWithML = processSensorDataWithML;
/**
 * Proses data thermal (suhu)
 */
const processThermalData = (rawData) => {
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
    // SELALU simpan data untuk realtime display
    return { incident_type: "NORMAL", confidence: null, shouldSave: true };
};
/**
 * Proses data water leak
 */
const processWaterData = (rawData) => {
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
    // SELALU simpan data untuk realtime display
    return { incident_type: "NORMAL", confidence: null, shouldSave: true };
};
/**
 * Buat log insiden baru
 */
const createLog = async (deviceId, incidentType, confidence, rawData) => {
    // Simpan semua data sensor untuk realtime display
    const dataToStore = {
        sensor_type: rawData.type,
    };
    if (rawData.type === "vibration") {
        dataToStore.accelerometer = {
            x: rawData.data.accX,
            y: rawData.data.accY,
            z: rawData.data.accZ,
        };
        dataToStore.gyroscope = {
            x: rawData.data.gyroX,
            y: rawData.data.gyroY,
            z: rawData.data.gyroZ,
        };
        dataToStore.mic_level = rawData.data.mic_level;
    }
    else if (rawData.type === "thermal") {
        // Simpan full thermal data untuk grid visualization
        dataToStore.thermal_data = rawData.data.thermal_data;
        dataToStore.temperature = rawData.data.avg_temperature;
        dataToStore.min_temperature = rawData.data.min_temperature;
        dataToStore.max_temperature = rawData.data.max_temperature;
        dataToStore.is_alert = rawData.data.is_alert;
        // Simpan camera image jika ada
        if (rawData.data.camera_image) {
            dataToStore.camera_image = rawData.data.camera_image;
        }
    }
    else if (rawData.type === "water") {
        dataToStore.water_level = rawData.data.water_level;
        dataToStore.water_raw = rawData.data.water_raw;
    }
    const log = await proteksiAsetLog_1.default.create({
        device_id: deviceId,
        incident_type: incidentType,
        confidence,
        data: dataToStore,
    });
    // Update last_heartbeat pada device
    await models_1.Device.update({ last_heartbeat: new Date(), status: "Online" }, { where: { id: deviceId } });
    return log;
};
exports.createLog = createLog;
/**
 * Ambil log berdasarkan device dengan pagination
 */
const getLogsByDevice = async (deviceId, options = {}) => {
    const { startDate, endDate, limit = 100, offset = 0 } = options;
    const whereClause = { device_id: deviceId };
    if (startDate || endDate) {
        whereClause.timestamp = {};
        if (startDate)
            whereClause.timestamp[sequelize_1.Op.gte] = startDate;
        if (endDate)
            whereClause.timestamp[sequelize_1.Op.lte] = endDate;
    }
    const { count, rows } = await proteksiAsetLog_1.default.findAndCountAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
        limit,
        offset,
    });
    return { logs: rows, total: count };
};
exports.getLogsByDevice = getLogsByDevice;
/**
 * Ambil log berdasarkan area
 */
const getLogsByArea = async (areaId, options = {}) => {
    const { startDate, endDate, limit = 100, offset = 0 } = options;
    // Cari semua device di area ini
    const devices = await models_1.Device.findAll({
        where: { area_id: areaId, system_type: "proteksi_aset" },
        attributes: ["id"],
    });
    const deviceIds = devices.map((d) => d.id);
    if (deviceIds.length === 0) {
        return { logs: [], total: 0 };
    }
    const whereClause = {
        device_id: { [sequelize_1.Op.in]: deviceIds },
    };
    if (startDate || endDate) {
        whereClause.timestamp = {};
        if (startDate)
            whereClause.timestamp[sequelize_1.Op.gte] = startDate;
        if (endDate)
            whereClause.timestamp[sequelize_1.Op.lte] = endDate;
    }
    const { count, rows } = await proteksiAsetLog_1.default.findAndCountAll({
        where: whereClause,
        order: [["timestamp", "DESC"]],
        limit,
        offset,
    });
    return { logs: rows, total: count };
};
exports.getLogsByArea = getLogsByArea;
/**
 * Ambil statistik untuk chart (24 jam terakhir)
 */
const getStatsForChart = async (areaId) => {
    // Cari semua device di area ini
    const devices = await models_1.Device.findAll({
        where: { area_id: areaId, system_type: "proteksi_aset" },
        attributes: ["id"],
    });
    const deviceIds = devices.map((d) => d.id);
    if (deviceIds.length === 0) {
        return [];
    }
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await proteksiAsetLog_1.default.findAll({
        where: {
            device_id: { [sequelize_1.Op.in]: deviceIds },
            timestamp: { [sequelize_1.Op.gte]: oneDayAgo },
        },
        order: [["timestamp", "ASC"]],
    });
    return logs.map((log) => {
        const rawValues = log.data?.raw_values || {};
        return {
            time: log.timestamp.toISOString(),
            vibration: rawValues.accX || 0,
            sound: rawValues.mic_level || 0,
        };
    });
};
exports.getStatsForChart = getStatsForChart;
/**
 * Ambil ringkasan insiden
 */
const getSummary = async (areaId) => {
    // Cari semua device di area ini
    const devices = await models_1.Device.findAll({
        where: { area_id: areaId, system_type: "proteksi_aset" },
        attributes: ["id"],
    });
    const deviceIds = devices.map((d) => d.id);
    if (deviceIds.length === 0) {
        return { totalIncidents: 0, activeIncidents: 0 };
    }
    const whereClause = { device_id: { [sequelize_1.Op.in]: deviceIds } };
    const totalIncidents = await proteksiAsetLog_1.default.count({ where: whereClause });
    const activeIncidents = await proteksiAsetLog_1.default.count({
        where: { ...whereClause, is_cleared: false },
    });
    return { totalIncidents, activeIncidents };
};
exports.getSummary = getSummary;
/**
 * Clear (acknowledge) insiden
 */
const clearIncident = async (incidentId) => {
    const log = await proteksiAsetLog_1.default.findByPk(incidentId);
    if (!log) {
        return null;
    }
    log.is_cleared = true;
    await log.save();
    return log;
};
exports.clearIncident = clearIncident;
/**
 * Ambil status terkini area
 */
const getCurrentStatus = async (areaId) => {
    // Cari semua device di area ini
    const devices = await models_1.Device.findAll({
        where: { area_id: areaId, system_type: "proteksi_aset" },
        attributes: ["id"],
    });
    const deviceIds = devices.map((d) => d.id);
    if (deviceIds.length === 0) {
        return { status: "AMAN", lastIncident: null };
    }
    // Cari insiden aktif terbaru
    const lastActiveIncident = await proteksiAsetLog_1.default.findOne({
        where: {
            device_id: { [sequelize_1.Op.in]: deviceIds },
            is_cleared: false,
            incident_type: { [sequelize_1.Op.ne]: "NORMAL" },
        },
        order: [["timestamp", "DESC"]],
    });
    if (!lastActiveIncident) {
        return { status: "AMAN", lastIncident: null };
    }
    // Tentukan status berdasarkan tipe insiden
    const dangerTypes = ["IMPACT", "WATER_LEAK"];
    const warningTypes = ["VIBRATION", "THERMAL"];
    let status = "AMAN";
    if (dangerTypes.includes(lastActiveIncident.incident_type)) {
        status = "BAHAYA";
    }
    else if (warningTypes.includes(lastActiveIncident.incident_type)) {
        status = "WASPADA";
    }
    return { status, lastIncident: lastActiveIncident };
};
exports.getCurrentStatus = getCurrentStatus;
