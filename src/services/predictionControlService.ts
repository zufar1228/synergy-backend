/**
 * Prediction Control Service
 *
 * Evaluates ML prediction results against thresholds and determines
 * if actuators should be triggered predictively.
 *
 * Thresholds (from environment or defaults):
 * - Temperature: >= 35°C → activate fan
 * - Humidity: >= 80% → activate dehumidifier
 * - CO2: >= 1500 ppm → activate fan
 */

import { Device, Area, PredictionResult } from '../db/models';
import * as actuatorStateTracker from './actuatorStateTracker';
import * as predictionAlertService from './predictionAlertService';
import * as lingkunganService from './lingkunganService';

// Hardcoded thresholds for predictive actuation
const PREDICT_TEMP_THRESHOLD = 35; //°C
const PREDICT_HUMIDITY_THRESHOLD = 80; // %
const PREDICT_CO2_THRESHOLD = 1500; // ppm

/**
 * Evaluate prediction result and trigger actuators if thresholds exceeded.
 */
export const evaluatePredictionAndControl = async (
  deviceId: string,
  prediction: {
    predicted_temperature: number;
    predicted_humidity: number;
    predicted_co2: number;
  }
) => {
  try {
    const device = await Device.findByPk(deviceId, {
      include: [{ model: Area, as: 'area', attributes: ['id', 'warehouse_id'] }]
    });

    if (!device) {
      console.error(`[PredictionControl] Device ${deviceId} not found`);
      return;
    }

    // Check manual override
    if (
      (device as any).control_mode === 'MANUAL' &&
      (device as any).manual_override_until
    ) {
      const overrideExpiry = new Date((device as any).manual_override_until);
      if (overrideExpiry > new Date()) {
        console.log(
          '[PredictionControl] Manual override active. Skipping predictive control.'
        );
        return;
      }
      // Override expired, switch back to AUTO
      await device.update({
        control_mode: 'AUTO',
        manual_override_until: null
      });
    }

    let shouldTriggerFan = false;
    let shouldTriggerDehumidifier = false;
    const triggeredReasons: string[] = [];

    // Evaluate thresholds
    if (prediction.predicted_temperature >= PREDICT_TEMP_THRESHOLD) {
      shouldTriggerFan = true;
      triggeredReasons.push(
        `Prediksi Suhu ${prediction.predicted_temperature.toFixed(1)}°C (>= ${PREDICT_TEMP_THRESHOLD}°C)`
      );
    }

    if (prediction.predicted_humidity >= PREDICT_HUMIDITY_THRESHOLD) {
      shouldTriggerDehumidifier = true;
      triggeredReasons.push(
        `Prediksi Kelembapan ${prediction.predicted_humidity.toFixed(1)}% (>= ${PREDICT_HUMIDITY_THRESHOLD}%)`
      );
    }

    if (prediction.predicted_co2 >= PREDICT_CO2_THRESHOLD) {
      shouldTriggerFan = true;
      triggeredReasons.push(
        `Prediksi CO2 ${prediction.predicted_co2.toFixed(0)}ppm (>= ${PREDICT_CO2_THRESHOLD}ppm)`
      );
    }

    // Execute actuation commands
    if (shouldTriggerFan || shouldTriggerDehumidifier) {
      const command: any = {};

      if (
        shouldTriggerFan &&
        actuatorStateTracker.shouldToggleActuator(deviceId, 'fan', true)
      ) {
        command.fan = 'ON';
        await actuatorStateTracker.turnOnActuator(
          deviceId,
          'fan',
          'predictive'
        );
      }

      if (
        shouldTriggerDehumidifier &&
        actuatorStateTracker.shouldToggleActuator(
          deviceId,
          'dehumidifier',
          true
        )
      ) {
        command.dehumidifier = 'ON';
        await actuatorStateTracker.turnOnActuator(
          deviceId,
          'dehumidifier',
          'predictive'
        );
      }

      // Send command to ESP32 via MQTT
      if (Object.keys(command).length > 0) {
        await lingkunganService.sendActuatorCommand(deviceId, command, device);
      }

      // Update prediction record with triggers
      await PredictionResult.update(
        {
          fan_triggered: shouldTriggerFan,
          dehumidifier_triggered: shouldTriggerDehumidifier
        },
        {
          where: { device_id: deviceId },
          order: [['timestamp', 'DESC']],
          limit: 1
        } as any
      );

      // Store latest predictions in device record
      await device.update({
        last_prediction_temperature: prediction.predicted_temperature,
        last_prediction_humidity: prediction.predicted_humidity,
        last_prediction_co2: prediction.predicted_co2
      });

      // Send Telegram alert about prediction-triggered actuation
      await predictionAlertService.sendPredictionAlert(
        deviceId,
        device,
        prediction,
        triggeredReasons
      );
    } else {
      // Store predictions even if thresholds not exceeded
      await device.update({
        last_prediction_temperature: prediction.predicted_temperature,
        last_prediction_humidity: prediction.predicted_humidity,
        last_prediction_co2: prediction.predicted_co2
      });
    }
  } catch (error: any) {
    console.error(
      '[PredictionControl] Error evaluating prediction:',
      error.message
    );
  }
};
