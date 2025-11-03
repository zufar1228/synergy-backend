// backend/src/services/analyticsService.ts

import { sequelize } from "../db/config";
import {
  Device,
  LingkunganLog,
  Incident,
  KeamananLog,
  Area,
} from "../db/models";
import ApiError from "../utils/apiError";
import { Op, ModelStatic, Model } from "sequelize";
import { format } from "date-fns"; // Pastikan 'format' diimpor

// Map string system_type ke Sequelize Model
const logModels: { [key: string]: ModelStatic<Model<any, any>> } = {
  lingkungan: LingkunganLog,
  gangguan: Incident, // <-- Tambahkan model untuk 'gangguan'
  keamanan: KeamananLog, // <-- TAMBAHKAN
};

interface AnalyticsQuery {
  system_type: string;
  area_id?: string;
  page?: number;
  per_page?: number;
  from?: string;
  to?: string;
}

// Definisikan tipe untuk hasil summary Lingkungan
interface LingkunganSummary {
  avg_temp: string | null;
  max_humidity: string | null;
  min_temp: string | null;
  avg_co2: string | null;
}

export const getAnalyticsData = async (query: AnalyticsQuery) => {
  const { system_type, area_id, from, to } = query;
  const page = query.page || 1;
  const perPage = query.per_page || 25;
  const offset = (page - 1) * perPage;

  // Ganti nama variabel menjadi lebih generik (DataModel)
  const DataModel = logModels[system_type];
  if (!DataModel) {
    throw new ApiError(400, `Invalid system_type: ${system_type}`);
  }

  const whereCondition: any = {};
  const deviceWhereCondition: any = { area_id: area_id };
  const dateColumn =
    system_type === "gangguan" || system_type === "keamanan"
      ? "created_at"
      : "timestamp";

  if (from || to) {
    whereCondition[dateColumn] = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) }),
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
  } else if (system_type === "gangguan") {
    modelAttributes = [
      "id",
      "device_id",
      "created_at",
      "incident_type",
      "confidence",
      "status",
      "notes",
    ];
  } else if (system_type === "keamanan") {
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
  // ========================================================

  const { count, rows: data } = await DataModel.findAndCountAll({
    attributes: modelAttributes, // <-- Terapkan daftar atribut di sini
    where: whereCondition,
    include: [
      {
        model: Device,
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
  let summary: object = {};

  if (system_type === "lingkungan") {
    // Logika summary untuk 'lingkungan' tetap sama persis
    const aggResult = (await LingkunganLog.findOne({
      attributes: [
        [sequelize.fn("AVG", sequelize.col("temperature")), "avg_temp"],
        [sequelize.fn("MAX", sequelize.col("humidity")), "max_humidity"],
        [sequelize.fn("MIN", sequelize.col("temperature")), "min_temp"],
        [sequelize.fn("AVG", sequelize.col("co2_ppm")), "avg_co2"], // <-- 2. TAMBAHKAN AVG CO2
      ],
      where: whereCondition,
      include: [
        {
          model: Device,
          as: "device",
          attributes: [],
          where: area_id ? { area_id } : undefined,
          required: !!area_id,
        },
      ],
      raw: true,
    })) as LingkunganSummary | null;

    if (aggResult && aggResult.avg_temp !== null) {
      summary = {
        avg_temp:
          aggResult.avg_temp !== null
            ? parseFloat(aggResult.avg_temp).toFixed(2)
            : "N/A",
        max_humidity: parseInt(aggResult.max_humidity || "0", 10),
        min_temp:
          aggResult.min_temp !== null
            ? parseFloat(aggResult.min_temp).toFixed(2)
            : "N/A",
        avg_co2: parseInt((aggResult as any).avg_co2, 10), // <-- 3. TAMBAHKAN KE SUMMARY
      };
    } else {
      summary = {
        avg_temp: "N/A",
        max_humidity: "N/A",
        min_temp: "N/A",
        avg_co2: "N/A", // <-- TAMBAHKAN KE DEFAULT
      };
    }
  } else if (system_type === "gangguan") {
    // Logika summary baru untuk 'gangguan'
    // Cukup gunakan hasil 'count' dari query utama, lebih efisien!
    summary = {
      total_incidents: count,
    };
  } else if (system_type === "keamanan") {
    // --- Logika Summary BARU untuk Keamanan ---
    const totalDetections = await KeamananLog.count({
      where: whereCondition,
      include: [
        {
          model: Device,
          as: "device",
          attributes: [],
          where: area_id ? deviceWhereCondition : undefined,
          required: !!area_id,
        },
      ],
    });

    const unacknowledged = await KeamananLog.count({
      where: { ...whereCondition, status: "unacknowledged" },
      include: [
        {
          model: Device,
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

export const getIncidentSummaryByType = async (filters: {
  area_id?: string;
  from?: string;
  to?: string;
}) => {
  const { area_id, from, to } = filters;

  const whereCondition: any = {};
  const deviceWhereCondition: any = {};
  if (area_id) deviceWhereCondition.area_id = area_id;

  if (from || to) {
    whereCondition.created_at = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) }),
    };
  }

  const results = await Incident.findAll({
    attributes: [
      "incident_type",
      [sequelize.fn("COUNT", sequelize.col("incident_type")), "total"],
    ],
    include: [
      {
        model: Device,
        as: "device",
        attributes: [],
        where: area_id ? deviceWhereCondition : undefined,
        required: !!area_id,
      },
    ],
    where: whereCondition,
    group: ["incident_type"],
    order: [[sequelize.fn("COUNT", sequelize.col("incident_type")), "DESC"]],
    raw: true,
  });

  // Ubah format agar sesuai dengan yang dibutuhkan oleh library chart
  // Sequelize mengembalikan 'total' sebagai string, jadi kita parse ke integer
  const formattedResults = results.map((item: any) => ({
    name: item.incident_type,
    total: parseInt(item.total, 10),
  }));

  return formattedResults;
};

export const getIncidentTrendByWarehouse = async (filters: {
  warehouse_id: string;
  from?: string;
  to?: string;
}) => {
  const { warehouse_id, from, to } = filters;

  const whereCondition: any = {};
  if (from || to) {
    whereCondition.created_at = {
      ...(from && { [Op.gte]: new Date(from) }),
      ...(to && { [Op.lte]: new Date(to) }),
    };
  }

  const results = await Incident.findAll({
    attributes: [
      // Truncate timestamp ke level 'hari' dan beri nama alias 'date'
      [
        sequelize.fn("DATE_TRUNC", "day", sequelize.col("Incident.created_at")),
        "date",
      ],
      // Hitung jumlah insiden per hari
      [sequelize.fn("COUNT", sequelize.col("Incident.id")), "total"],
    ],
    include: [
      {
        model: Device,
        as: "device",
        attributes: [],
        required: true,
        include: [
          {
            model: Area,
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
  const formattedResults = results.map((item: any) => ({
    date: format(new Date(item.date), "dd MMM"), // Format tanggal (e.g., "11 Okt")
    total: parseInt(item.total, 10),
  }));

  return formattedResults;
};
