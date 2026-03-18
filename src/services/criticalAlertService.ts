/**
 * Critical Alert Service
 *
 * Detects when actual sensor readings exceed critical thresholds
 * but ML predictions are below thresholds (mismatch/edge case scenario).
 *
 * This indicates the environment might be degrading unexpectedly and
 * prompts the user to activate manual control mode.
 *
 * Critical thresholds (more conservative than predictive):
 * - Temperature: >= 34°C
 * - Humidity: >= 79%
 * - CO2: >= 1450 ppm
 */

import { Device, LingkunganLog, PredictionResult } from '../db/models';
import * as telegramService from './telegramService';

// Hardcoded thresholds for critical alert detection
const CRITICAL_TEMP_THRESHOLD = 34; // °C
const CRITICAL_HUMIDITY_THRESHOLD = 79; // %
const CRITICAL_CO2_THRESHOLD = 1450; // ppm

// Hardcoded thresholds for prediction comparison
const PREDICT_TEMP_THRESHOLD = 35; // °C
const PREDICT_HUMIDITY_THRESHOLD = 80; // %
const PREDICT_CO2_THRESHOLD = 1500; // ppm

// Track which devices have already been alerted in current session
// to avoid alert spam
const alertedDevices = new Map<string, { timestamp: Date; type: string }>();

/**
 * Check for critical conditions with prediction mismatch.
 * Called when actual sensor data exceeds critical thresholds.
 */
export const checkCriticalMismatch = async (
  deviceId: string,
  actualData: {
    temperature: number;
    humidity: number;
    co2: number;
  }
) => {
  try {
    const device = await Device.findByPk(deviceId, {
      include: [{ association: 'area' }]
    });

    if (!device) {
      console.error(`[CriticalAlert] Device ${deviceId} not found`);
      return;
    }

    // Check if any critical threshold is exceeded
    const tempCritical = actualData.temperature >= CRITICAL_TEMP_THRESHOLD;
    const humidityCritical = actualData.humidity >= CRITICAL_HUMIDITY_THRESHOLD;
    const co2Critical = actualData.co2 >= CRITICAL_CO2_THRESHOLD;

    if (!tempCritical && !humidityCritical && !co2Critical) {
      // No critical condition
      return;
    }

    // Get latest prediction
    const latestPrediction = await PredictionResult.findOne({
      where: { device_id: deviceId },
      order: [['timestamp', 'DESC']]
    });

    if (!latestPrediction) {
      // No prediction yet, can't do mismatch detection
      return;
    }

    // Check if prediction would have triggered actuation
    const predictionWouldTrigger =
      latestPrediction.predicted_temperature >= PREDICT_TEMP_THRESHOLD ||
      latestPrediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD ||
      latestPrediction.predicted_co2 >= PREDICT_CO2_THRESHOLD;

    // Only send alert if actual is critical but prediction is NOT
    if (!predictionWouldTrigger) {
      await sendCriticalMismatchAlert(
        deviceId,
        device,
        actualData,
        latestPrediction
      );
    }
  } catch (error: any) {
    console.error('[CriticalAlert] Error checking mismatch:', error.message);
  }
};

/**
 * Send alert when critical condition detected with prediction mismatch
 */
const sendCriticalMismatchAlert = async (
  deviceId: string,
  device: Device,
  actualData: {
    temperature: number;
    humidity: number;
    co2: number;
  },
  prediction: any
) => {
  try {
    // Check if we've already alerted for this device recently
    const lastAlert = alertedDevices.get(deviceId);
    if (lastAlert) {
      const timeSinceLastAlert = Date.now() - lastAlert.timestamp.getTime();
      const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
      if (timeSinceLastAlert < ALERT_COOLDOWN_MS) {
        console.log(
          `[CriticalAlert] Skipping alert for ${deviceId} (cooldown active)`
        );
        return;
      }
    }

    const area = (device as any).area;
    const warehouse = area?.warehouse;

    const warehouseName = warehouse?.name || 'Tidak Diketahui';
    const areaName = area?.name || 'Tidak Diketahui';
    const deviceName = device.name || deviceId;

    // Build critical condition details
    const criticalDetails: string[] = [];
    if (actualData.temperature >= CRITICAL_TEMP_THRESHOLD) {
      criticalDetails.push(
        `🌡️ Suhu Aktual: ${actualData.temperature.toFixed(1)}°C (>= ${CRITICAL_TEMP_THRESHOLD}°C)`
      );
    }
    if (actualData.humidity >= CRITICAL_HUMIDITY_THRESHOLD) {
      criticalDetails.push(
        `💧 Kelembapan Aktual: ${actualData.humidity.toFixed(1)}% (>= ${CRITICAL_HUMIDITY_THRESHOLD}%)`
      );
    }
    if (actualData.co2 >= CRITICAL_CO2_THRESHOLD) {
      criticalDetails.push(
        `🌫️ CO2 Aktual: ${actualData.co2.toFixed(0)}ppm (>= ${CRITICAL_CO2_THRESHOLD}ppm)`
      );
    }

    const message = `
🚨 <b>KONDISI KRITIS TERDETEKSI!</b> 🚨

<b>⚠️ PERHATIAN:</b> Kondisi sebenarnya kritis, namun prediksi model STABIL.
Ini mungkin indikasi anomali atau perubahan tiba-tiba.

📍 <b>Lokasi:</b> ${warehouseName} - ${areaName}
🔧 <b>Device:</b> ${deviceName}

📊 <b>Kondisi Saat Ini (KRITIS):</b>
${criticalDetails.map((d) => `   ${d}`).join('\n')}

📈 <b>Prediksi 15 Menit Ke Depan (STABIL):</b>
   • Suhu: ${prediction.predicted_temperature.toFixed(1)}°C
   • Kelembapan: ${prediction.predicted_humidity.toFixed(1)}%
   • CO2: ${prediction.predicted_co2.toFixed(0)}ppm

❗ <b>TINDAKAN DIPERLUKAN:</b>
   👤 Harap segera aktifkan <b>Mode Manual</b> di Dashboard
   🖲️ Kontrol aktuator secara langsung untuk mengatasi kondisi kritis
   📋 Periksa sensor apakah ada yang rusak atau tidak akurat

🕐 <b>Waktu:</b> ${new Date().toLocaleString('id-ID')}

<i>Mode Manual memungkinkan Anda mengontrol kipas dan dehumidifier secara langsung during 5 menit.</i>
`.trim();

    await telegramService.sendGroupAlert(message);

    // Record alert in cooldown map
    alertedDevices.set(deviceId, {
      timestamp: new Date(),
      type: 'critical_mismatch'
    });

    console.log(
      `[CriticalAlert] Critical mismatch alert sent for device ${deviceId}`
    );
  } catch (error: any) {
    console.error('[CriticalAlert] Failed to send alert:', error.message);
  }
};

/**
 * Clear alert cooldown (for testing or manual reset)
 */
export const clearAlertCooldown = (deviceId?: string) => {
  if (deviceId) {
    alertedDevices.delete(deviceId);
  } else {
    alertedDevices.clear();
  }
};
