"use strict";
// backend/src/services/analyticsService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIncidentTrendByWarehouse = exports.getIncidentSummaryByType = exports.getAnalyticsData = void 0;
const config_1 = require("../db/config");
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
const date_fns_1 = require("date-fns"); // Pastikan 'format' diimpor
// Map string system_type ke Sequelize Model
const logModels = {
    lingkungan: models_1.LingkunganLog,
    gangguan: models_1.Incident, // <-- Tambahkan model untuk 'gangguan'
    keamanan: models_1.KeamananLog, // <-- TAMBAHKAN
    intrusi: models_1.IntrusiLog, // <-- TAMBAHKAN untuk TinyML
    proteksi_aset: models_1.ProteksiAsetLog, // <-- TAMBAHKAN untuk Proteksi Aset
};
const getAnalyticsData = async (query) => {
    const { system_type, area_id, from, to } = query;
    const page = query.page || 1;
    const perPage = query.per_page || 25;
    const offset = (page - 1) * perPage;
    // Ganti nama variabel menjadi lebih generik (DataModel)
    const DataModel = logModels[system_type];
    if (!DataModel) {
        throw new apiError_1.default(400, `Invalid system_type: ${system_type}`);
    }
    const whereCondition = {};
    const deviceWhereCondition = { area_id: area_id };
    const dateColumn = system_type === "gangguan" || system_type === "keamanan" || system_type === "proteksi_aset"
        ? "created_at"
        : "timestamp";
    if (from || to) {
        whereCondition[dateColumn] = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) }),
        };
    }
    // === PERBAIKAN UTAMA: Definisikan kolom yang akan diambil ===
    let modelAttributes;
    if (system_type === "lingkungan") {
        modelAttributes = [
            "id",
            "device_id",
            "timestamp",
            "payload",
            "temperature",
            "humidity",
            "co2_ppm", // <-- 1. TAMBAHKAN 'co2_ppm'
        ];
    }
    else if (system_type === "gangguan") {
        modelAttributes = [
            "id",
            "device_id",
            "created_at",
            "incident_type",
            "confidence",
            "status",
            "notes",
        ];
    }
    else if (system_type === "keamanan") {
        modelAttributes = [
            "id",
            "device_id",
            "created_at",
            "image_url",
            "detected", // <-- 'detected' sekarang ada di sini
            "box",
            "confidence",
            "attributes",
            "status",
            "notes",
        ];
    }
    else if (system_type === "intrusi") {
        modelAttributes = [
            "id",
            "device_id",
            "timestamp",
            "event_class",
            "confidence",
            "payload",
        ];
    }
    else if (system_type === "proteksi_aset") {
        modelAttributes = [
            "id",
            "device_id",
            "created_at",
            "incident_type",
            "confidence",
            "data",
            "is_cleared",
        ];
    }
    // ========================================================
    const { count, rows: data } = await DataModel.findAndCountAll({
        attributes: modelAttributes, // <-- Terapkan daftar atribut di sini
        where: whereCondition,
        include: [
            {
                model: models_1.Device,
                as: "device",
                attributes: ["id", "name"],
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id,
            },
        ],
        limit: perPage,
        offset: offset,
        order: [[dateColumn, "DESC"]],
    });
    // --- Query 2: Hitung Data Ringkasan (Summary) ---
    let summary = {};
    if (system_type === "lingkungan") {
        // Logika summary untuk 'lingkungan' tetap sama persis
        const aggResult = (await models_1.LingkunganLog.findOne({
            attributes: [
                [config_1.sequelize.fn("AVG", config_1.sequelize.col("temperature")), "avg_temp"],
                [config_1.sequelize.fn("MAX", config_1.sequelize.col("humidity")), "max_humidity"],
                [config_1.sequelize.fn("MIN", config_1.sequelize.col("temperature")), "min_temp"],
                [config_1.sequelize.fn("AVG", config_1.sequelize.col("co2_ppm")), "avg_co2"], // <-- 2. TAMBAHKAN AVG CO2
            ],
            where: whereCondition,
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? { area_id } : undefined,
                    required: !!area_id,
                },
            ],
            raw: true,
        }));
        if (aggResult && aggResult.avg_temp !== null) {
            summary = {
                avg_temp: aggResult.avg_temp !== null
                    ? parseFloat(aggResult.avg_temp).toFixed(2)
                    : "N/A",
                max_humidity: parseInt(aggResult.max_humidity || "0", 10),
                min_temp: aggResult.min_temp !== null
                    ? parseFloat(aggResult.min_temp).toFixed(2)
                    : "N/A",
                avg_co2: parseInt(aggResult.avg_co2, 10), // <-- 3. TAMBAHKAN KE SUMMARY
            };
        }
        else {
            summary = {
                avg_temp: "N/A",
                max_humidity: "N/A",
                min_temp: "N/A",
                avg_co2: "N/A", // <-- TAMBAHKAN KE DEFAULT
            };
        }
    }
    else if (system_type === "gangguan") {
        // Logika summary baru untuk 'gangguan'
        // Cukup gunakan hasil 'count' dari query utama, lebih efisien!
        summary = {
            total_incidents: count,
        };
    }
    else if (system_type === "keamanan") {
        // --- Logika Summary BARU untuk Keamanan ---
        const totalDetections = await models_1.KeamananLog.count({
            where: whereCondition,
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        const unacknowledged = await models_1.KeamananLog.count({
            where: { ...whereCondition, status: "unacknowledged" },
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        summary = {
            total_detections: totalDetections,
            unacknowledged_alerts: unacknowledged,
        };
    }
    else if (system_type === "intrusi") {
        // --- Logika Summary untuk Intrusi (TinyML) ---
        const totalEvents = count;
        const intrusions = await models_1.IntrusiLog.count({
            where: { ...whereCondition, event_class: "Intrusion" },
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        const disturbances = await models_1.IntrusiLog.count({
            where: { ...whereCondition, event_class: "Disturbance" },
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        // Get the deviceId for the first device in this area with intrusi type
        const intrusiDevice = await models_1.Device.findOne({
            where: { area_id, system_type: "intrusi" },
            attributes: ["id"],
        });
        summary = {
            total_events: totalEvents,
            intrusions,
            disturbances,
            normals: totalEvents - intrusions - disturbances,
        };
        // Return with deviceId for the component
        return {
            summary,
            logs: data,
            deviceId: intrusiDevice?.id || null,
            pagination: {
                total: count,
                page: page,
                per_page: perPage,
                total_pages: Math.ceil(count / perPage),
            },
        };
    }
    else if (system_type === "proteksi_aset") {
        // --- Logika Summary untuk Proteksi Aset ---
        const totalIncidents = count;
        const activeIncidents = await models_1.ProteksiAsetLog.count({
            where: { ...whereCondition, is_cleared: false },
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        const clearedIncidents = await models_1.ProteksiAsetLog.count({
            where: { ...whereCondition, is_cleared: true },
            include: [
                {
                    model: models_1.Device,
                    as: "device",
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id,
                },
            ],
        });
        // Get the deviceId for the first device in this area with proteksi_aset type
        const proteksiAsetDevice = await models_1.Device.findOne({
            where: { area_id, system_type: "proteksi_aset" },
            attributes: ["id"],
        });
        summary = {
            total_incidents: totalIncidents,
            active_incidents: activeIncidents,
            cleared_incidents: clearedIncidents,
        };
        // Return with deviceId for the component
        return {
            summary,
            logs: data,
            deviceId: proteksiAsetDevice?.id || null,
            pagination: {
                total: count,
                page: page,
                per_page: perPage,
                total_pages: Math.ceil(count / perPage),
            },
        };
    }
    // --- Gabungkan Hasil ---
    return {
        summary,
        logs: data, // <-- Ganti nama properti dari 'logs' agar konsisten
        pagination: {
            total: count,
            page: page,
            per_page: perPage,
            total_pages: Math.ceil(count / perPage),
        },
    };
};
exports.getAnalyticsData = getAnalyticsData;
const getIncidentSummaryByType = async (filters) => {
    const { area_id, from, to } = filters;
    const whereCondition = {};
    const deviceWhereCondition = {};
    if (area_id)
        deviceWhereCondition.area_id = area_id;
    if (from || to) {
        whereCondition.created_at = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) }),
        };
    }
    const results = await models_1.Incident.findAll({
        attributes: [
            "incident_type",
            [config_1.sequelize.fn("COUNT", config_1.sequelize.col("incident_type")), "total"],
        ],
        include: [
            {
                model: models_1.Device,
                as: "device",
                attributes: [],
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id,
            },
        ],
        where: whereCondition,
        group: ["incident_type"],
        order: [[config_1.sequelize.fn("COUNT", config_1.sequelize.col("incident_type")), "DESC"]],
        raw: true,
    });
    // Ubah format agar sesuai dengan yang dibutuhkan oleh library chart
    // Sequelize mengembalikan 'total' sebagai string, jadi kita parse ke integer
    const formattedResults = results.map((item) => ({
        name: item.incident_type,
        total: parseInt(item.total, 10),
    }));
    return formattedResults;
};
exports.getIncidentSummaryByType = getIncidentSummaryByType;
const getIncidentTrendByWarehouse = async (filters) => {
    const { warehouse_id, from, to } = filters;
    const whereCondition = {};
    if (from || to) {
        whereCondition.created_at = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) }),
        };
    }
    const results = await models_1.Incident.findAll({
        attributes: [
            // Truncate timestamp ke level 'hari' dan beri nama alias 'date'
            [
                config_1.sequelize.fn("DATE_TRUNC", "day", config_1.sequelize.col("Incident.created_at")),
                "date",
            ],
            // Hitung jumlah insiden per hari
            [config_1.sequelize.fn("COUNT", config_1.sequelize.col("Incident.id")), "total"],
        ],
        include: [
            {
                model: models_1.Device,
                as: "device",
                attributes: [],
                required: true,
                include: [
                    {
                        model: models_1.Area,
                        as: "area",
                        attributes: [],
                        where: { warehouse_id: warehouse_id },
                        required: true,
                    },
                ],
            },
        ],
        where: whereCondition,
        group: ["date"], // Kelompokkan hasil berdasarkan hari
        order: [["date", "ASC"]], // Urutkan dari tanggal terlama
        raw: true,
    });
    // Format hasil agar mudah digunakan oleh library chart
    const formattedResults = results.map((item) => ({
        date: (0, date_fns_1.format)(new Date(item.date), "dd MMM"), // Format tanggal (e.g., "11 Okt")
        total: parseInt(item.total, 10),
    }));
    return formattedResults;
};
exports.getIncidentTrendByWarehouse = getIncidentTrendByWarehouse;
