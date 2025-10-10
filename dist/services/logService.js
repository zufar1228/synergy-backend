"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestLingkunganLog = void 0;
// backend/src/services/logService.ts
const models_1 = require("../db/models");
// Impor model log lainnya di sini nanti
const ingestLingkunganLog = async (logData) => {
    await models_1.LingkunganLog.create({
        ...logData,
        timestamp: new Date(),
    });
    console.log(`[Log Service] Ingested lingkungan log for device ${logData.device_id}`);
};
exports.ingestLingkunganLog = ingestLingkunganLog;
// Buat fungsi ingest untuk tipe log lain di sini
