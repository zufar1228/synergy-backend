"use strict";
// backend/src/services/analyticsService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsData = void 0;
const config_1 = require("../db/config");
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
// Map string system_type ke Sequelize Model
const logModels = {
    lingkungan: models_1.LingkunganLog,
    keamanan: models_1.KeamananLog,
    intrusi: models_1.IntrusiLog
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
    const dateColumn = system_type === 'keamanan' ? 'created_at' : 'timestamp';
    if (from || to) {
        whereCondition[dateColumn] = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
    // === PERBAIKAN UTAMA: Definisikan kolom yang akan diambil ===
    let modelAttributes;
    if (system_type === 'lingkungan') {
        modelAttributes = [
            'id',
            'device_id',
            'timestamp',
            'payload',
            'temperature',
            'humidity',
            'co2_ppm' // <-- 1. TAMBAHKAN 'co2_ppm'
        ];
    }
    else if (system_type === 'keamanan') {
        modelAttributes = [
            'id',
            'device_id',
            'created_at',
            'image_url',
            'detected', // <-- 'detected' sekarang ada di sini
            'box',
            'confidence',
            'attributes',
            'status',
            'notes'
        ];
    }
    else if (system_type === 'intrusi') {
        modelAttributes = [
            'id',
            'device_id',
            'timestamp',
            'event_type',
            'system_state',
            'door_state',
            'peak_delta_g',
            'hit_count',
            'payload',
            'status',
            'notes'
        ];
    }
    // ========================================================
    const { count, rows: data } = await DataModel.findAndCountAll({
        attributes: modelAttributes, // <-- Terapkan daftar atribut di sini
        where: whereCondition,
        include: [
            {
                model: models_1.Device,
                as: 'device',
                attributes: ['id', 'name'],
                where: area_id ? deviceWhereCondition : undefined,
                required: !!area_id
            }
        ],
        limit: perPage,
        offset: offset,
        order: [[dateColumn, 'DESC']]
    });
    // --- Query 2: Hitung Data Ringkasan (Summary) ---
    let summary = {};
    if (system_type === 'lingkungan') {
        // Logika summary untuk 'lingkungan' tetap sama persis
        const aggResult = (await models_1.LingkunganLog.findOne({
            attributes: [
                [config_1.sequelize.fn('AVG', config_1.sequelize.col('temperature')), 'avg_temp'],
                [config_1.sequelize.fn('MAX', config_1.sequelize.col('humidity')), 'max_humidity'],
                [config_1.sequelize.fn('MIN', config_1.sequelize.col('temperature')), 'min_temp'],
                [config_1.sequelize.fn('AVG', config_1.sequelize.col('co2_ppm')), 'avg_co2'] // <-- 2. TAMBAHKAN AVG CO2
            ],
            where: whereCondition,
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? { area_id } : undefined,
                    required: !!area_id
                }
            ],
            raw: true
        }));
        if (aggResult && aggResult.avg_temp !== null) {
            summary = {
                avg_temp: aggResult.avg_temp !== null
                    ? parseFloat(aggResult.avg_temp).toFixed(2)
                    : 'N/A',
                max_humidity: parseInt(aggResult.max_humidity || '0', 10),
                min_temp: aggResult.min_temp !== null
                    ? parseFloat(aggResult.min_temp).toFixed(2)
                    : 'N/A',
                avg_co2: aggResult.avg_co2 !== null
                    ? parseInt(aggResult.avg_co2, 10)
                    : 'N/A' // <-- 3. TAMBAHKAN KE SUMMARY
            };
        }
        else {
            summary = {
                avg_temp: 'N/A',
                max_humidity: 'N/A',
                min_temp: 'N/A',
                avg_co2: 'N/A' // <-- TAMBAHKAN KE DEFAULT
            };
        }
    }
    else if (system_type === 'keamanan') {
        // --- Logika Summary BARU untuk Keamanan ---
        const totalDetections = await models_1.KeamananLog.count({
            where: whereCondition,
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        const unacknowledged = await models_1.KeamananLog.count({
            where: { ...whereCondition, status: 'unacknowledged' },
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        summary = {
            total_detections: totalDetections,
            unacknowledged_alerts: unacknowledged
        };
    }
    else if (system_type === 'intrusi') {
        // --- Logika Summary untuk Intrusi (Door Security) ---
        const totalEvents = await models_1.IntrusiLog.count({
            where: whereCondition,
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        const alarmEvents = await models_1.IntrusiLog.count({
            where: {
                ...whereCondition,
                event_type: { [sequelize_1.Op.in]: ['FORCED_ENTRY_ALARM', 'UNAUTHORIZED_OPEN'] }
            },
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        const impactWarnings = await models_1.IntrusiLog.count({
            where: {
                ...whereCondition,
                event_type: 'IMPACT_WARNING'
            },
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        const unacknowledgedIntrusi = await models_1.IntrusiLog.count({
            where: { ...whereCondition, status: 'unacknowledged' },
            include: [
                {
                    model: models_1.Device,
                    as: 'device',
                    attributes: [],
                    where: area_id ? deviceWhereCondition : undefined,
                    required: !!area_id
                }
            ]
        });
        summary = {
            total_events: totalEvents,
            alarm_events: alarmEvents,
            impact_warnings: impactWarnings,
            unacknowledged: unacknowledgedIntrusi
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
            total_pages: Math.ceil(count / perPage)
        }
    };
};
exports.getAnalyticsData = getAnalyticsData;
