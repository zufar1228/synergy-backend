// backend/src/services/logService.ts
import { LingkunganLog } from "../db/models";
// Impor model log lainnya di sini nanti

export const ingestLingkunganLog = async (logData: {
  device_id: string;
  payload: object;
  temperature?: number;
  humidity?: number;
  co2_ppm?: number;
}) => {
  await LingkunganLog.create({
    ...logData,
    timestamp: new Date(),
  });
  console.log(
    `[Log Service] Ingested lingkungan log for device ${logData.device_id}`
  );
};

// Buat fungsi ingest untuk tipe log lain di sini
