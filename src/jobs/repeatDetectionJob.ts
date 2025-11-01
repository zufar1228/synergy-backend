// backend/src/jobs/repeatDetectionJob.ts
import cron from "node-cron";
import * as repeatDetectionService from "../services/repeatDetectionService";

const checkRepeatDetections = async () => {
  console.log("[Cron Job] Menjalankan pemeriksaan deteksi berulang...");
  try {
    // Panggil service yang sudah kita buat
    await repeatDetectionService.findAndNotifyRepeatDetections();
  } catch (error) {
    console.error("[Cron Job] Error saat memeriksa deteksi berulang:", error);
  }
};

// Jadwalkan untuk berjalan setiap menit: '*/1 * * * *'
export const startRepeatDetectionJob = () => {
  cron.schedule("*/1 * * * *", checkRepeatDetections);
  console.log(
    "[Cron Job] Penjadwalan deteksi berulang (setiap menit) telah aktif."
  );
};
