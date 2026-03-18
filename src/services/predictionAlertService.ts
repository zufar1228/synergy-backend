/**
 * Prediction Alert Service
 *
 * Sends Telegram notifications when ML predictions exceed thresholds
 * and actuators are being proactively activated.
 */

import { Device } from '../db/models';
import * as telegramService from './telegramService';

/**
 * Send alert to Telegram when prediction triggers actuation
 */
export const sendPredictionAlert = async (
  deviceId: string,
  device: Device,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
  },
  triggeredReasons: string[]
) => {
  try {
    const area = (device as any).area;
    const warehouse = area?.warehouse;

    const warehouseName = warehouse?.name || 'Tidak Diketahui';
    const areaName = area?.name || 'Tidak Diketahui';
    const deviceName = device.name || deviceId;

    // Build triggered actions
    const actions: string[] = [];
    if (prediction.predicted_temperature >= 35) {
      actions.push('✓ Kipas Dinyalakan');
    }
    if (
      prediction.predicted_humidity >= 80 ||
      prediction.predicted_co2 >= 1500
    ) {
      actions.push('✓ Dehumidifier Dinyalakan');
    }

    // Format reason list with emojis
    const reasonsHtml = triggeredReasons.map((r) => `   📊 ${r}`).join('\n');

    const message = `
⚡ <b>AKTUASI PREDIKTIF DIAKTIFKAN</b> ⚡

📍 <b>Lokasi:</b> ${warehouseName} - ${areaName}
🔧 <b>Device:</b> ${deviceName}

📈 <b>Prediksi 15 Menit Ke Depan:</b>
   • Suhu: ${prediction.predicted_temperature.toFixed(1)}°C
   • Kelembapan: ${prediction.predicted_humidity.toFixed(1)}%
   • CO2: ${prediction.predicted_co2.toFixed(0)}ppm

⚡ <b>Alasan Pemicu:</b>
${reasonsHtml}

✅ <b>Aksi yang Diambil:</b>
${actions.map((a) => `   ${a}`).join('\n')}

🕐 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}

<i>Sistem mengaktifkan aktuator secara proaktif untuk mencegah kondisi kritis.</i>
`.trim();

    await telegramService.sendGroupAlert(message);
    console.log(`[PredictionAlert] Telegram alert sent for device ${deviceId}`);
  } catch (error: any) {
    console.error('[PredictionAlert] Failed to send alert:', error.message);
  }
};
