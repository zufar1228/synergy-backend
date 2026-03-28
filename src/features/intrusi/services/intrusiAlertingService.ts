// features/intrusi/services/intrusiAlertingService.ts
import {
  Device,
  Area,
  Warehouse
} from '../../../db/models';
import { formatTimestampWIB } from '../../../utils/time';
import { notifySubscribers } from '../../../services/alertingService';

interface DeviceWithRelations extends Device {
  area: Area & {
    warehouse: Warehouse;
  };
}

/**
 * Process alarm events from the door security (intrusi) system.
 * Called for FORCED_ENTRY_ALARM and UNAUTHORIZED_OPEN events.
 */
export const processIntrusiAlert = async (
  deviceId: string,
  data: {
    type: string;
    state?: string;
    door?: string;
    peak_delta_g?: number;
    hit_count?: number;
    [key: string]: any;
  }
) => {
  console.log(
    `[Alerting] 🚨 Intrusi alarm: ${data.type} for device ${deviceId}`
  );

  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: 'area',
        include: [{ model: Warehouse, as: 'warehouse' }]
      }
    ]
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;

  const timestamp = formatTimestampWIB();

  const isUnauthorizedOpen = data.type === 'UNAUTHORIZED_OPEN';
  const incidentType = isUnauthorizedOpen
    ? 'Pembukaan Pintu Tidak Sah'
    : 'Percobaan Pembobolan (Forced Entry)';

  const details: { key: string; value: string }[] = [
    { key: 'Tipe Event', value: data.type },
    { key: 'Status Pintu', value: data.door || 'N/A' },
    { key: 'Mode Sistem', value: data.state || 'N/A' }
  ];

  if (!isUnauthorizedOpen && data.peak_delta_g != null) {
    details.push({
      key: 'Peak Impact (g)',
      value: data.peak_delta_g.toFixed(3)
    });
    if (data.anomaly_count != null) {
      details.push({
        key: 'Jumlah Anomali (Window)',
        value: `${data.anomaly_count} / ${data.window_threshold ?? 3}`
      });
    } else if (data.hit_count != null) {
      details.push({ key: 'Hit Count', value: String(data.hit_count) });
    }
  }

  const emailProps = {
    deviceId,
    incidentType,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details
  };
  const subject = `🚨 [ALARM INTRUSI] ${incidentType} di ${warehouse.name} - ${area.name}`;

  try {
    await notifySubscribers('intrusi', subject, emailProps);
    console.log('[Alerting] Intrusi alert notifications sent.');
  } catch (err) {
    console.error('[Alerting] Error sending intrusi alert notifications:', err);
  }
};

// ============================================================================
// POWER & BATTERY ALERTS
// ============================================================================
const devicePowerState: Map<
  string,
  {
    lastPowerSource?: string;
    lastBatteryCriticalSentAt?: Date;
  }
> = new Map();

const BATTERY_CRITICAL_PCT = 10;
const BATTERY_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Process power/battery status and send alerts when:
 * - Power source changes (MAINS ↔ BATTERY)
 * - Battery percentage drops to critical level
 */
export const processPowerAlert = async (
  deviceId: string,
  data: {
    power_source?: string;
    vbat_v?: number;
    vbat_pct?: number;
  }
) => {
  const state = devicePowerState.get(deviceId) || {};
  let shouldAlert = false;
  let alertType: 'power_change' | 'battery_critical' = 'power_change';

  if (
    data.power_source &&
    state.lastPowerSource &&
    data.power_source !== state.lastPowerSource
  ) {
    shouldAlert = true;
    alertType = 'power_change';
    console.log(
      `[Alerting] ⚡ Power source changed for ${deviceId}: ${state.lastPowerSource} → ${data.power_source}`
    );
  }

  if (data.power_source) {
    state.lastPowerSource = data.power_source;
  }

  if (
    data.vbat_pct !== undefined &&
    data.vbat_pct <= BATTERY_CRITICAL_PCT &&
    data.power_source === 'BATTERY'
  ) {
    const now = new Date();
    const lastSent = state.lastBatteryCriticalSentAt;
    if (
      !lastSent ||
      now.getTime() - lastSent.getTime() > BATTERY_ALERT_COOLDOWN_MS
    ) {
      shouldAlert = true;
      alertType = 'battery_critical';
      state.lastBatteryCriticalSentAt = now;
      console.log(
        `[Alerting] 🪫 Battery critical for ${deviceId}: ${data.vbat_pct}%`
      );
    }
  }

  devicePowerState.set(deviceId, state);

  if (!shouldAlert) return;

  const device = (await Device.findByPk(deviceId, {
    include: [
      {
        model: Area,
        as: 'area',
        include: [{ model: Warehouse, as: 'warehouse' }]
      }
    ]
  })) as DeviceWithRelations | null;

  if (!device || !device.area || !device.area.warehouse) {
    console.error(
      `[Alerting] GAGAL: Perangkat/relasi ${deviceId} tidak ditemukan.`
    );
    return;
  }

  const { area } = device;
  const { warehouse } = area;
  const timestamp = formatTimestampWIB();

  let incidentType: string;
  let subject: string;
  const details: { key: string; value: string }[] = [];

  if (alertType === 'battery_critical') {
    incidentType = 'Baterai Kritis';
    subject = `🪫 [BATERAI KRITIS] ${device.name} di ${warehouse.name} - ${area.name}`;
    details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
    if (data.vbat_v !== undefined) {
      details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
    }
    details.push({ key: 'Sumber Daya', value: 'BATERAI (Adaptor Terputus)' });
  } else {
    const isSwitchToBattery = data.power_source === 'BATTERY';
    incidentType = isSwitchToBattery
      ? 'Sumber Daya Beralih ke Baterai'
      : 'Sumber Daya Adaptor Terhubung Kembali';
    subject = isSwitchToBattery
      ? `⚡ [DAYA BERALIH] ${device.name} beralih ke Baterai — ${warehouse.name}`
      : `✅ [DAYA PULIH] ${device.name} kembali ke Adaptor — ${warehouse.name}`;
    details.push({
      key: 'Sumber Daya',
      value: isSwitchToBattery ? 'BATERAI' : 'ADAPTOR (PLN)'
    });
    if (data.vbat_pct !== undefined) {
      details.push({ key: 'Kapasitas Baterai', value: `${data.vbat_pct}%` });
    }
    if (data.vbat_v !== undefined) {
      details.push({ key: 'Tegangan', value: `${data.vbat_v.toFixed(2)}V` });
    }
  }

  const emailProps = {
    incidentType,
    warehouseName: warehouse.name,
    areaName: area.name,
    deviceName: device.name,
    timestamp,
    details
  };

  try {
    await notifySubscribers('intrusi', subject, emailProps);
    console.log(`[Alerting] Power/battery alert sent for ${deviceId}.`);
  } catch (err) {
    console.error('[Alerting] Error sending power alert:', err);
  }
};
