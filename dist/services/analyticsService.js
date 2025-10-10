"use strict";
// backend/src/services/analyticsService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIncidentSummaryByType = exports.getAnalyticsData = void 0;
const config_1 = require("../db/config");
const models_1 = require("../db/models"); // <-- Import Incident
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
// Map string system_type ke Sequelize Model
const logModels = {
    lingkungan: models_1.LingkunganLog,
    gangguan: models_1.Incident, // <-- Tambahkan model untuk 'gangguan'
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
    // --- Bangun Kondisi Query (WHERE clause) ---
    const whereCondition = {};
    const deviceWhereCondition = { area_id: area_id };
    // Tentukan kolom tanggal secara dinamis
    const dateColumn = system_type === "gangguan" ? "created_at" : "timestamp";
    if (from || to) {
        whereCondition[dateColumn] = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) }),
        };
    }
    // --- Query 1: Ambil Data dengan Paginasi ---
    const { count, rows: data } = await DataModel.findAndCountAll({
        where: whereCondition,
        include: [
            {
                model: models_1.Device,
                as: "device",
                attributes: ["id", "name"], // <-- Ambil juga id dan name device
                // Terapkan filter area_id hanya jika ada nilainya
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id,
            },
        ],
        limit: perPage,
        offset: offset,
        order: [[dateColumn, "DESC"]], // <-- Gunakan kolom tanggal dinamis
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
            };
        }
        else {
            summary = {
                avg_temp: "N/A",
                max_humidity: "N/A",
                min_temp: "N/A",
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
