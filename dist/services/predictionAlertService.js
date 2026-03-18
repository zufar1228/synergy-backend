"use strict";
/**
 * Prediction Alert Service
 *
 * Sends Telegram notifications when ML predictions exceed thresholds
 * and actuators are being proactively activated.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPredictionAlert = void 0;
const telegramService = __importStar(require("./telegramService"));
/**
 * Send alert to Telegram when prediction triggers actuation
 */
const sendPredictionAlert = async (deviceId, device, prediction, triggeredReasons) => {
    try {
        const area = device.area;
        const warehouse = area?.warehouse;
        const warehouseName = warehouse?.name || 'Tidak Diketahui';
        const areaName = area?.name || 'Tidak Diketahui';
        const deviceName = device.name || deviceId;
        // Build triggered actions
        const actions = [];
        if (prediction.predicted_temperature >= 35) {
            actions.push('✓ Kipas Dinyalakan');
        }
        if (prediction.predicted_humidity >= 80 ||
            prediction.predicted_co2 >= 1500) {
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
    }
    catch (error) {
        console.error('[PredictionAlert] Failed to send alert:', error.message);
    }
};
exports.sendPredictionAlert = sendPredictionAlert;
