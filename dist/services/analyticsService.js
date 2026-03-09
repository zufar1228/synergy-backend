"use strict";
// backend/src/services/analyticsService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsData = void 0;
const models_1 = require("../db/models");
const apiError_1 = __importDefault(require("../utils/apiError"));
const sequelize_1 = require("sequelize");
// Map string system_type ke Sequelize Model
const logModels = {
    keamanan: models_1.KeamananLog,
    intrusi: models_1.IntrusiLog,
    lingkungan: models_1.LingkunganLog
};
const getAnalyticsData = async (query) => {
    const { system_type, area_id, from, to, status, event_type, system_state, door_state } = query;
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
    if (status)
        whereCondition.status = { [sequelize_1.Op.in]: status.split(',') };
    if (event_type)
        whereCondition.event_type = { [sequelize_1.Op.in]: event_type.split(',') };
    if (system_state)
        whereCondition.system_state = { [sequelize_1.Op.in]: system_state.split(',') };
    if (door_state)
        whereCondition.door_state = { [sequelize_1.Op.in]: door_state.split(',') };
    // === PERBAIKAN UTAMA: Definisikan kolom yang akan diambil ===
    let modelAttributes;
    if (system_type === 'keamanan') {
        modelAttributes = [
            'id',
            'device_id',
            'created_at',
            'image_url',
            'detected',
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
    else if (system_type === 'lingkungan') {
        modelAttributes = [
            'id',
            'device_id',
            'timestamp',
            'temperature',
            'humidity',
            'co2',
            'status',
            'notes'
        ];
    }
    if (from || to) {
        whereCondition[dateColumn] = {
            ...(from && { [sequelize_1.Op.gte]: new Date(from) }),
            ...(to && { [sequelize_1.Op.lte]: new Date(to) })
        };
    }
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
    if (system_type === 'keamanan') {
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
    else if (system_type === 'lingkungan') {
        // --- Logika Summary untuk Lingkungan (Environmental Monitoring) ---
        const totalReadings = await models_1.LingkunganLog.count({
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
        const unacknowledgedLingkungan = await models_1.LingkunganLog.count({
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
            total_readings: totalReadings,
            unacknowledged: unacknowledgedLingkungan
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
