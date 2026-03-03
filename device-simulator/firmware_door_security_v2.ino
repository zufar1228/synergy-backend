// ============================================================================
//  WAREHOUSE DOOR SECURITY SYSTEM — FIRMWARE v3.0
//  Microcontroller: Seeed XIAO ESP32-S3
//  Sensors: MPU6050 (I²C), Reed Switch, Battery ADC
//  Actuators: MOSFET-driven Piezo Siren
//  Connectivity: WiFi + MQTT over TLS (EMQX Cloud)
//  Spec: SECURITY_SYSTEM_SPEC v19
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <Preferences.h>
#include <time.h>
#include <math.h>    // expf()
#include <stdlib.h>  // qsort()

// ============================================================================
//  PIN MAPPING (XIAO ESP32-S3) — per Spec v18 §2.5
// ============================================================================
#define PIN_SDA             5   // D4
#define PIN_SCL             6   // D5
#define PIN_MPU_INT         1   // D0
#define PIN_VBAT_SENSE      3   // D1 (ADC) — Spec §2.5.2
#define PIN_ADAPTER_PRESENT 2   // D2 (digital) — Spec §2.5.1
#define PIN_DOOR_SWITCH     4   // D3 (reed switch, INPUT_PULLUP)
#define PIN_SIREN           7   // D8 (output)

// SIM800L module pins — kept OFF to save power (not used in this firmware)
#define PIN_SIM800L_TX      43  // D6 (GPIO 43)
#define PIN_SIM800L_RX      44  // D7 (GPIO 44)

// ============================================================================
//  WIFI CONFIG — EDIT SESUAI JARINGAN ANDA
// ============================================================================
static const char* WIFI_SSID = "HUAWEI-3X5S";
static const char* WIFI_PASS = "Gr6TCfJ4";

// ============================================================================
//  MQTT CONFIG — EDIT SESUAI BROKER / EMQX PROVISIONING
// ============================================================================
// Hostname saja (tanpa https:// — PubSubClient menggunakan raw TCP+TLS)
static const char* MQTT_BROKER   = "mfe19520.ala.asia-southeast1.emqxsl.com";
static const int   MQTT_PORT     = 8883;  // MQTT over TLS
static const char* MQTT_USER     = "device-8e819e4a-9710-491f-9fbc-741892ae6195";
static const char* MQTT_PASS     = "pwd-8e819e4a-9710-491f-9fbc-741892ae6195-1772377701318";

// ============================================================================
//  DEVICE & TOPOLOGY CONFIG — dari provisioning dashboard
// ============================================================================
static const char* DEVICE_ID     = "8e819e4a-9710-491f-9fbc-741892ae6195";
static const char* WAREHOUSE_ID  = "eec544fc-bacb-4568-bc46-594ed5b5616f";
static const char* AREA_ID       = "4eb04ea1-865c-4043-a982-634ed59f6c7e";

// ============================================================================
//  SYSTEM PARAMETERS — Spec v19
// ============================================================================

// --- Threat Scoring: Leaky Bucket (§6.2) ---
static constexpr float    LAMBDA           = 0.025f;   // decay rate per second
static constexpr float    H_ADD            = 1.0f;     // score added per valid hit
static constexpr float    S_ALARM          = 2.0f;     // threshold → FORCED_ENTRY_ALARM
static constexpr uint32_t MIN_INTERHIT_MS  = 300;      // debounce between hits

// --- IMU Sampling (§5) ---
static constexpr uint32_t IMU_SAMPLE_MS    = 10;       // 100 Hz

// --- Siren Policy (§8) ---
static constexpr uint32_t SIREN_ON_MS      = 30000;    // 30s siren duration
static constexpr uint32_t ALARM_COOLDOWN_MS = 30000;   // 30s cooldown after siren off

// --- Calibration: Two-Stage (§7) ---
static constexpr float    ALPHA            = 0.75f;    // knock threshold factor
static constexpr float    GAMMA_CAL        = 2.5f;     // noise threshold factor
static constexpr uint32_t NOISE_DURATION_MS = 120000;  // 120s noise baseline (Stage A)
static constexpr uint8_t  N_CALIB_KNOCKS   = 9;        // knocks for Stage B
static constexpr uint32_t CALIB_KNOCK_TIMEOUT_MS = 60000; // 60s timeout for knock stage
static constexpr uint16_t NOISE_MAX_SAMPLES = 12000;   // max samples for Stage A (120s @ 100Hz)

// --- Battery Monitoring: Robust (§9) ---
static constexpr uint32_t VBAT_READ_INTERVAL_MS        = 10000;  // read every 10s
static constexpr uint32_t POST_SIREN_SETTLE_MS         = 5000;   // gating after siren off
static constexpr uint32_t POST_SOURCE_CHANGE_SETTLE_MS = 2000;   // gating after power change
static constexpr float    V_BAT_IMPLAUSIBLE            = 4.35f;  // anomaly: discard above this
static constexpr float    V_LOW_ENTER                  = 3.60f;  // enter LOW level
static constexpr float    V_LOW_EXIT                   = 3.65f;  // exit LOW → NORMAL
static constexpr float    V_CRIT_ENTER                 = 3.40f;  // enter CRITICAL level
static constexpr float    V_CRIT_EXIT                  = 3.45f;  // exit CRITICAL → LOW
static constexpr uint8_t  VBAT_MEDIAN_N                = 15;     // median filter window

// --- Heartbeat ---
static constexpr uint32_t STATUS_INTERVAL_MS = 15000;  // heartbeat every 15s

// ============================================================================
//  STATE ENUMERATIONS
// ============================================================================
enum SystemState { STATE_DISARMED, STATE_ARMED };
enum SirenState  { SIREN_OFF, SIREN_ON_ACTIVE, SIREN_COOLDOWN };
enum CalibState  { CALIB_IDLE, CALIB_NOISE, CALIB_KNOCK };
enum BattLevel   { BATT_NORMAL, BATT_LOW, BATT_CRITICAL };
enum NetPolicy   { NET_IDLE_SAVE, NET_PREWAKE, NET_ALARM_ACTIVE, NET_COOLDOWN_HOLD };

// ============================================================================
//  RUNTIME GLOBALS
// ============================================================================

// --- Threat Score (Leaky Bucket) ---
static float    threatScore  = 0.0f;
static uint32_t lastDecayMs  = 0;
static uint32_t lastHitTs    = 0;

// --- Hit Threshold (calibrated) ---
static float TH_HIT = 1.0f;   // default, overridden by NVS/calibration

// --- System/Siren State ---
static volatile SystemState systemState = STATE_DISARMED;
static SirenState  sirenState  = SIREN_OFF;
static uint32_t sirenOnStartMs  = 0;
static uint32_t cooldownStartMs = 0;
static uint32_t sirenOffMs      = 0;   // timestamp when siren turned off (for gating)

// --- Door State ---
static bool doorClosed     = true;
static bool doorClosedPrev = true;

// --- Power / Battery ---
static bool     adapterPresent     = true;
static bool     adapterPresentPrev = true;
static float    lastVbatV          = 0.0f;
static int      lastVbatPct        = 0;
static uint32_t lastVbatReadMs     = 0;
static uint32_t sourceChangeMs     = 0;   // timestamp when power source changed (for gating)
static BattLevel   battLevel       = BATT_NORMAL;
static BattLevel   prevBattLevel   = BATT_NORMAL;

// --- Network Policy ---
static NetPolicy netPolicy = NET_IDLE_SAVE;

// --- Calibration (Two-Stage) ---
static CalibState calibState      = CALIB_IDLE;
static uint32_t   calibStartMs    = 0;

// Stage A: Noise Baseline
static float*   noiseSamples      = nullptr;
static uint16_t noiseSampleCount  = 0;
static float    n995              = 0.0f;   // noise 99.5th percentile

// Stage B: Knock Capture
static float    calibKnockPeaks[15];
static uint8_t  calibKnockCount   = 0;
static uint32_t calibKnockStartMs = 0;     // start of knock stage

// --- NTP ---
static bool ntpSynced = false;

// --- MQTT Topics (160 bytes for long UUID paths) ---
static char TOPIC_SENSOR[160];
static char TOPIC_STATUS[160];
static char TOPIC_CMD[160];
static uint32_t lastMqttReconnectAttempt = 0;
static uint32_t lastStatusPublish = 0;

// --- IMU Timing ---
static uint32_t nextImuTick = 0;

// --- Hardware Instances ---
static Adafruit_MPU6050 mpu;
static WiFiClientSecure wifiSecureClient;
static PubSubClient mqtt(wifiSecureClient);
static Preferences preferences;

// ============================================================================
//  UTILITY: LOGGING + TIMESTAMPS
// ============================================================================
static void logMsg(const String &msg) {
  Serial.print("[");
  Serial.print(millis());
  Serial.print("] ");
  Serial.println(msg);
}

static void ntpSync() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  logMsg("[NTP] Syncing time...");
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 10000)) {
    ntpSynced = true;
    logMsg("[NTP] Time synced.");
  } else {
    logMsg("[NTP] Sync failed — using millis fallback.");
  }
}

static String isoTimestamp() {
  if (ntpSynced) {
    time_t now;
    time(&now);
    struct tm ti;
    gmtime_r(&now, &ti);
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    return String("\"ts\":\"") + buf + "\"";
  }
  return String("\"ts_ms\":") + String((unsigned long)millis());
}

// ============================================================================
//  NVS — PERSIST CALIBRATION DATA
// ============================================================================
static void saveParamsToNVS() {
  preferences.begin("security", false);
  preferences.putFloat("th_hit", TH_HIT);
  preferences.putFloat("n995", n995);
  preferences.putFloat("alpha", ALPHA);
  preferences.end();
  logMsg("[NVS] Saved TH_HIT=" + String(TH_HIT, 4) + " N995=" + String(n995, 4));
}

static void loadParamsFromNVS() {
  preferences.begin("security", true);
  TH_HIT = preferences.getFloat("th_hit", 1.0f);  // match old v18 default
  n995   = preferences.getFloat("n995", 0.0f);
  preferences.end();
  logMsg("[NVS] Loaded TH_HIT=" + String(TH_HIT, 4) + " N995=" + String(n995, 4));
}

// ============================================================================
//  WIFI
// ============================================================================
static void wifiConnect() {
  logMsg("[WiFi] Connecting to " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
    Serial.print(".");
    if (millis() - t0 > 20000) {
      logMsg("[WiFi] Connection timeout!");
      return;
    }
  }
  logMsg("[WiFi] Connected. IP=" + WiFi.localIP().toString()
       + " RSSI=" + String(WiFi.RSSI()) + "dBm");
}

// ============================================================================
//  MQTT INFRASTRUCTURE
// ============================================================================
static void buildTopics() {
  snprintf(TOPIC_SENSOR, sizeof(TOPIC_SENSOR),
    "warehouses/%s/areas/%s/devices/%s/sensors/intrusi",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(TOPIC_STATUS, sizeof(TOPIC_STATUS),
    "warehouses/%s/areas/%s/devices/%s/status",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(TOPIC_CMD, sizeof(TOPIC_CMD),
    "warehouses/%s/areas/%s/devices/%s/commands",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
}

static void mqttPublish(const char* topic, const String &payload) {
  if (mqtt.connected()) {
    mqtt.publish(topic, payload.c_str(), false);
    logMsg("[MQTT] PUB " + String(topic) + " → " + payload.substring(0, 140));
  } else {
    logMsg("[MQTT] Not connected. Event lost: " + payload.substring(0, 80));
  }
}

// ============================================================================
//  JSON HELPERS
// ============================================================================
static String baseJson(const char* eventType) {
  String j = "{";
  j += isoTimestamp();
  j += ",\"device_id\":\"" + String(DEVICE_ID) + "\"";
  j += ",\"state\":\"" + String(systemState == STATE_ARMED ? "ARMED" : "DISARMED") + "\"";
  j += ",\"door\":\"" + String(doorClosed ? "CLOSED" : "OPEN") + "\"";
  j += ",\"type\":\"" + String(eventType) + "\"";
  return j;
}

// Helper: BattLevel → string
static const char* battLevelStr(BattLevel bl) {
  switch (bl) {
    case BATT_LOW:      return "LOW";
    case BATT_CRITICAL: return "CRITICAL";
    default:            return "NORMAL";
  }
}

// Helper: NetPolicy → string
static const char* netPolicyStr(NetPolicy np) {
  switch (np) {
    case NET_PREWAKE:        return "PREWAKE";
    case NET_ALARM_ACTIVE:   return "ALARM_ACTIVE";
    case NET_COOLDOWN_HOLD:  return "COOLDOWN_HOLD";
    default:                 return "IDLE_SAVE";
  }
}

// Helper: CalibState → string
static const char* calibStateStr(CalibState cs) {
  switch (cs) {
    case CALIB_NOISE: return "NOISE";
    case CALIB_KNOCK: return "KNOCK";
    default:          return "IDLE";
  }
}

// ============================================================================
//  EVENT PUBLISHERS (Spec v19 §10)
// ============================================================================

static void publishImpactWarning(float peakDelta) {
  String j = baseJson("IMPACT_WARNING");
  j += ",\"peak_delta_g\":" + String(peakDelta, 4);
  j += ",\"threat_score\":" + String(threatScore, 4);
  j += ",\"s_alarm\":" + String(S_ALARM, 2);
  j += ",\"lambda_per_s\":" + String(LAMBDA, 4);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishForcedEntryAlarm(float peakDelta) {
  String j = baseJson("FORCED_ENTRY_ALARM");
  j += ",\"peak_delta_g\":" + String(peakDelta, 4);
  j += ",\"threat_score\":" + String(threatScore, 4);
  j += ",\"s_alarm\":" + String(S_ALARM, 2);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishUnauthorizedOpen() {
  String j = baseJson("UNAUTHORIZED_OPEN");
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishPowerSourceChanged(bool adapterNow) {
  String j = baseJson("POWER_SOURCE_CHANGED");
  j += ",\"power_source\":\"" + String(adapterNow ? "MAINS" : "BATTERY") + "\"";
  j += ",\"vbat_v\":" + String(lastVbatV, 2);
  j += ",\"vbat_pct\":" + String(lastVbatPct);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishBatteryLevelChanged(BattLevel newLevel, BattLevel oldLevel) {
  String j = baseJson("BATTERY_LEVEL_CHANGED");
  j += ",\"level\":\"" + String(battLevelStr(newLevel)) + "\"";
  j += ",\"previous_level\":\"" + String(battLevelStr(oldLevel)) + "\"";
  j += ",\"vbat_v\":" + String(lastVbatV, 2);
  j += ",\"vbat_pct\":" + String(lastVbatPct);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishCalibNoiseComplete() {
  String j = baseJson("CALIB_NOISE_COMPLETE");
  j += ",\"n995\":" + String(n995, 4);
  j += ",\"noise_samples\":" + String(noiseSampleCount);
  j += ",\"noise_duration_ms\":" + String(NOISE_DURATION_MS);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishCalibSaved(float kmed) {
  String j = baseJson("CALIB_SAVED");
  j += ",\"th_hit\":" + String(TH_HIT, 4);
  j += ",\"n995\":" + String(n995, 4);
  j += ",\"kmed\":" + String(kmed, 4);
  j += ",\"gamma\":" + String(GAMMA_CAL, 2);
  j += ",\"alpha\":" + String(ALPHA, 4);
  j += ",\"n_knocks\":" + String(N_CALIB_KNOCKS);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishCalibAborted(const char* stage, uint8_t received, uint8_t expected) {
  String j = baseJson("CALIB_ABORTED");
  j += ",\"stage\":\"" + String(stage) + "\"";
  j += ",\"hits_received\":" + String(received);
  j += ",\"hits_expected\":" + String(expected);
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishSirenSilenced(const String &issuedBy) {
  String j = baseJson("SIREN_SILENCED");
  j += ",\"issued_by\":\"" + issuedBy + "\"";
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishArmEvent() {
  String j = baseJson("ARM");
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishDisarmEvent() {
  String j = baseJson("DISARM");
  j += "}";
  mqttPublish(TOPIC_SENSOR, j);
}

static void publishStatus() {
  String j = "{";
  j += isoTimestamp();
  j += ",\"device_id\":\"" + String(DEVICE_ID) + "\"";
  j += ",\"state\":\"" + String(systemState == STATE_ARMED ? "ARMED" : "DISARMED") + "\"";
  j += ",\"door\":\"" + String(doorClosed ? "CLOSED" : "OPEN") + "\"";
  j += ",\"th_hit\":" + String(TH_HIT, 4);
  j += ",\"threat_score\":" + String(threatScore, 4);
  j += ",\"siren\":\"" + String(sirenState == SIREN_ON_ACTIVE ? "ON" :
                                 (sirenState == SIREN_COOLDOWN ? "COOLDOWN" : "OFF")) + "\"";
  j += ",\"power\":\"" + String(adapterPresent ? "MAINS" : "BATTERY") + "\"";
  j += ",\"vbat_v\":" + String(lastVbatV, 2);
  j += ",\"vbat_pct\":" + String(lastVbatPct);
  j += ",\"batt_level\":\"" + String(battLevelStr(battLevel)) + "\"";
  j += ",\"calib\":\"" + String(calibStateStr(calibState)) + "\"";
  j += ",\"net_policy\":\"" + String(netPolicyStr(netPolicy)) + "\"";
  j += "}";
  mqttPublish(TOPIC_STATUS, j);
}

// ============================================================================
//  SIREN CONTROL (Spec v19 §8)
// ============================================================================
static void sirenOn() {
  digitalWrite(PIN_SIREN, HIGH);
}

static void sirenOff() {
  digitalWrite(PIN_SIREN, LOW);
}

static void triggerAlarm() {
  if (sirenState == SIREN_COOLDOWN) {
    logMsg("[SIREN] Cooldown active — siren suppressed, event still published.");
    return;
  }
  if (sirenState == SIREN_ON_ACTIVE) {
    logMsg("[SIREN] Already ON.");
    return;
  }

  sirenOn();
  sirenState     = SIREN_ON_ACTIVE;
  sirenOnStartMs = millis();
  logMsg("[SIREN] ON for " + String(SIREN_ON_MS) + "ms");
}

static void sirenSilence(const String &issuedBy) {
  if (sirenState == SIREN_ON_ACTIVE) {
    sirenOff();
    sirenState      = SIREN_COOLDOWN;
    cooldownStartMs = millis();
    sirenOffMs      = millis();   // gating: mark when siren turned off
    logMsg("[SIREN] Silenced by " + issuedBy + ". Cooldown started.");
    publishSirenSilenced(issuedBy);
    publishStatus();
  } else {
    logMsg("[SIREN] Silence requested but siren not active.");
  }
}

static void sirenUpdate() {
  uint32_t now = millis();

  if (sirenState == SIREN_ON_ACTIVE) {
    if (now - sirenOnStartMs >= SIREN_ON_MS) {
      sirenOff();
      sirenState      = SIREN_COOLDOWN;
      cooldownStartMs = now;
      sirenOffMs      = now;   // gating: mark when siren turned off
      logMsg("[SIREN] OFF (duration elapsed). Cooldown started.");
    }
  }
  else if (sirenState == SIREN_COOLDOWN) {
    if (now - cooldownStartMs >= ALARM_COOLDOWN_MS) {
      sirenState = SIREN_OFF;
      logMsg("[SIREN] Cooldown finished. Ready.");
    }
  }
}

// ============================================================================
//  IMU READING (Spec v19 §5)
// ============================================================================
static float readDeltaG() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  const float G = 9.80665f;
  float ax_g = a.acceleration.x / G;
  float ay_g = a.acceleration.y / G;
  float az_g = a.acceleration.z / G;

  float a_mag = sqrtf(ax_g * ax_g + ay_g * ay_g + az_g * az_g);
  return fabsf(a_mag - 1.0f);
}

// ============================================================================
//  THREAT SCORING — LEAKY BUCKET (Spec v19 §6.2)
// ============================================================================
//  S decays exponentially: S(t) = S(prev) * exp(-LAMBDA * dt)
//  Each valid hit adds H_ADD to S.
//  When S >= S_ALARM → FORCED_ENTRY_ALARM + siren.
// ============================================================================

static void decayThreatScore() {
  uint32_t now = millis();
  if (lastDecayMs == 0) { lastDecayMs = now; return; }

  float dt_s = (now - lastDecayMs) / 1000.0f;
  lastDecayMs = now;

  if (dt_s > 0.0f && threatScore > 0.0f) {
    threatScore *= expf(-LAMBDA * dt_s);
    if (threatScore < 0.001f) threatScore = 0.0f;
  }
}

static void processHit(float peakDelta) {
  // Only active when ARMED and door CLOSED
  if (systemState != STATE_ARMED || !doorClosed) return;

  // Don't process hits during calibration
  if (calibState != CALIB_IDLE) return;

  uint32_t now = millis();

  // Check threshold and interhit debounce
  if (peakDelta >= TH_HIT && (now - lastHitTs) >= MIN_INTERHIT_MS) {
    lastHitTs = now;

    // Add to threat score
    threatScore += H_ADD;

    logMsg("[HIT] +H_ADD → S=" + String(threatScore, 4)
         + " peak=" + String(peakDelta, 4) + "g");

    // Check if alarm threshold reached
    if (threatScore >= S_ALARM) {
      logMsg("[HIT] FORCED_ENTRY_ALARM! S=" + String(threatScore, 4)
           + " >= S_ALARM=" + String(S_ALARM, 2));
      publishForcedEntryAlarm(peakDelta);
      triggerAlarm();
      // Reset threat score after alarm
      threatScore = 0.0f;
    } else {
      // Below threshold → IMPACT_WARNING
      publishImpactWarning(peakDelta);
    }
  }
}

// ============================================================================
//  CALIBRATION — TWO-STAGE (Spec v19 §7)
//  Stage A (NOISE): 120s passive noise floor measurement → N995
//  Stage B (KNOCK): User knocks 9 times → Kmed
//  TH_HIT = max(GAMMA * N995, ALPHA * Kmed)
// ============================================================================

// qsort comparator for floats (ascending)
static int compareFloat(const void* a, const void* b) {
  float fa = *(const float*)a;
  float fb = *(const float*)b;
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return 0;
}

static float medianOfArray(float* arr, int n) {
  // Bubble sort for small n (knock peaks, n <= 15)
  for (int i = 0; i < n - 1; i++) {
    for (int j = 0; j < n - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        float tmp  = arr[j];
        arr[j]     = arr[j + 1];
        arr[j + 1] = tmp;
      }
    }
  }
  if (n % 2 == 1) return arr[n / 2];
  return (arr[n / 2 - 1] + arr[n / 2]) / 2.0f;
}

static void calibStart() {
  if (calibState != CALIB_IDLE) {
    logMsg("[CALIB] Already running.");
    return;
  }

  // Allocate noise sample buffer
  noiseSamples = (float*)malloc(NOISE_MAX_SAMPLES * sizeof(float));
  if (noiseSamples == nullptr) {
    logMsg("[CALIB] ERROR: Failed to allocate noise buffer! Skipping noise stage.");
    // Fallback: go directly to knock stage without noise baseline
    n995 = 0.0f;
    calibKnockCount   = 0;
    calibKnockStartMs = millis();
    calibState        = CALIB_KNOCK;
    logMsg("[CALIB] Knock stage started (no noise baseline). Knock " + String(N_CALIB_KNOCKS) + " times.");
    return;
  }

  noiseSampleCount = 0;
  calibStartMs     = millis();
  calibState       = CALIB_NOISE;

  logMsg("[CALIB] Stage A (NOISE) started. Collecting baseline for "
       + String(NOISE_DURATION_MS / 1000) + "s. Keep environment quiet!");
  publishStatus();
}

static void calibProcessNoiseSample(float delta) {
  if (calibState != CALIB_NOISE) return;

  uint32_t now = millis();

  // Collect sample
  if (noiseSampleCount < NOISE_MAX_SAMPLES) {
    noiseSamples[noiseSampleCount++] = delta;
  }

  // Time check: noise stage complete?
  if (now - calibStartMs >= NOISE_DURATION_MS) {
    if (noiseSampleCount < 100) {
      logMsg("[CALIB] Too few noise samples (" + String(noiseSampleCount) + "). Aborting.");
      free(noiseSamples);
      noiseSamples = nullptr;
      calibState = CALIB_IDLE;
      publishCalibAborted("NOISE", 0, N_CALIB_KNOCKS);
      return;
    }

    // Sort and find 99.5th percentile
    qsort(noiseSamples, noiseSampleCount, sizeof(float), compareFloat);
    uint16_t idx995 = (uint16_t)(0.995f * (noiseSampleCount - 1));
    n995 = noiseSamples[idx995];

    logMsg("[CALIB] Stage A DONE. Samples=" + String(noiseSampleCount)
         + " N995=" + String(n995, 4) + "g");

    // Free noise buffer
    free(noiseSamples);
    noiseSamples = nullptr;

    publishCalibNoiseComplete();

    // Transition to Stage B (KNOCK)
    calibKnockCount   = 0;
    calibKnockStartMs = millis();
    calibState        = CALIB_KNOCK;

    logMsg("[CALIB] Stage B (KNOCK) started. Knock the door " + String(N_CALIB_KNOCKS)
         + " times from OUTSIDE! Timeout=" + String(CALIB_KNOCK_TIMEOUT_MS / 1000) + "s");
    publishStatus();
  }

  // Progress log every 30s
  static uint32_t lastProgressLog = 0;
  if (now - lastProgressLog >= 30000) {
    lastProgressLog = now;
    uint32_t elapsed = (now - calibStartMs) / 1000;
    uint32_t remaining = (NOISE_DURATION_MS / 1000) - elapsed;
    logMsg("[CALIB] Noise progress: " + String(noiseSampleCount) + " samples, "
         + String(remaining) + "s remaining");
  }
}

static void calibProcessKnockSample(float delta) {
  if (calibState != CALIB_KNOCK) return;

  uint32_t now = millis();

  // Timeout check
  if (now - calibKnockStartMs >= CALIB_KNOCK_TIMEOUT_MS) {
    calibState = CALIB_IDLE;
    logMsg("[CALIB] KNOCK TIMEOUT — aborted. Knocks received: " + String(calibKnockCount));
    publishCalibAborted("KNOCK", calibKnockCount, N_CALIB_KNOCKS);
    return;
  }

  // Detect knock: must exceed noise floor (or 0.1g minimum) + debounce
  float minThresh = (n995 > 0.05f) ? n995 : 0.1f;
  if (delta >= minThresh && (now - lastHitTs) >= MIN_INTERHIT_MS) {
    lastHitTs = now;
    calibKnockPeaks[calibKnockCount] = delta;
    calibKnockCount++;

    logMsg("[CALIB] Knock " + String(calibKnockCount) + "/" + String(N_CALIB_KNOCKS)
         + " peak=" + String(delta, 4) + "g");

    // All knocks received → compute threshold
    if (calibKnockCount >= N_CALIB_KNOCKS) {
      float kmed = medianOfArray(calibKnockPeaks, calibKnockCount);
      float th_noise = GAMMA_CAL * n995;
      float th_knock = ALPHA * kmed;
      TH_HIT = (th_noise > th_knock) ? th_noise : th_knock;

      logMsg("[CALIB] DONE! Kmed=" + String(kmed, 4)
           + " GAMMA*N995=" + String(th_noise, 4)
           + " ALPHA*Kmed=" + String(th_knock, 4)
           + " → TH_HIT=" + String(TH_HIT, 4));

      saveParamsToNVS();
      publishCalibSaved(kmed);

      calibState = CALIB_IDLE;
      publishStatus();
    }
  }
}

// ============================================================================
//  DOOR SWITCH (Reed) — Spec v19 §6.1
// ============================================================================
static void doorUpdate() {
  doorClosed = (digitalRead(PIN_DOOR_SWITCH) == LOW);

  if (doorClosed != doorClosedPrev) {
    doorClosedPrev = doorClosed;

    publishStatus();

    if (!doorClosed && systemState == STATE_ARMED) {
      if (sirenState == SIREN_ON_ACTIVE || sirenState == SIREN_COOLDOWN) {
        logMsg("[DOOR] Opened while alarm active — no duplicate alarm log.");
      } else {
        logMsg("[DOOR] UNAUTHORIZED_OPEN detected!");
        publishUnauthorizedOpen();
        triggerAlarm();
      }
    } else {
      logMsg("[DOOR] State changed → " + String(doorClosed ? "CLOSED" : "OPEN"));
    }
  }
}

// ============================================================================
//  BATTERY MONITORING — ROBUST (Spec v19 §9)
//  Gating, Median+EMA filter, Anomaly detection, Hysteresis levels
// ============================================================================

// Piecewise-linear Li-Ion 1S discharge curve (3.0V → 4.2V → 0% → 100%)
static int vbatToPercent(float v) {
  if (v >= 4.20f) return 100;
  if (v >= 4.00f) return 80 + (int)((v - 4.00f) / 0.20f * 20.0f);
  if (v >= 3.85f) return 60 + (int)((v - 3.85f) / 0.15f * 20.0f);
  if (v >= 3.70f) return 30 + (int)((v - 3.70f) / 0.15f * 30.0f);
  if (v >= 3.50f) return 10 + (int)((v - 3.50f) / 0.20f * 20.0f);
  if (v >= 3.30f) return  3 + (int)((v - 3.30f) / 0.20f * 7.0f);
  if (v >= 3.00f) return      (int)((v - 3.00f) / 0.30f * 3.0f);
  return 0;
}

// EMA state
static float vbatFiltered = 0.0f;

static float emaVbat(float x) {
  const float alpha_ema = 0.2f;
  if (vbatFiltered <= 0.1f) vbatFiltered = x;
  vbatFiltered = alpha_ema * x + (1.0f - alpha_ema) * vbatFiltered;
  return vbatFiltered;
}

// Gating check: should we skip battery reading?
static bool vbatGated() {
  uint32_t now = millis();

  // Gate during siren active
  if (sirenState == SIREN_ON_ACTIVE) return true;

  // Gate for POST_SIREN_SETTLE_MS after siren turns off
  if (sirenOffMs > 0 && (now - sirenOffMs) < POST_SIREN_SETTLE_MS) return true;

  // Gate for POST_SOURCE_CHANGE_SETTLE_MS after power source change
  if (sourceChangeMs > 0 && (now - sourceChangeMs) < POST_SOURCE_CHANGE_SETTLE_MS) return true;

  return false;
}

// Median filter + voltage conversion
static float readBatteryMedian() {
  float samples[VBAT_MEDIAN_N];
  for (int i = 0; i < VBAT_MEDIAN_N; i++) {
    samples[i] = (float)analogRead(PIN_VBAT_SENSE);
    delay(2);
  }
  // Bubble sort
  for (int i = 0; i < VBAT_MEDIAN_N - 1; i++) {
    for (int j = 0; j < VBAT_MEDIAN_N - i - 1; j++) {
      if (samples[j] > samples[j + 1]) {
        float tmp = samples[j];
        samples[j] = samples[j + 1];
        samples[j + 1] = tmp;
      }
    }
  }
  return samples[VBAT_MEDIAN_N / 2];  // median ADC value
}

static void readBatteryVoltage() {
  // Gating check
  if (vbatGated()) {
    Serial.println("[VBAT] Gated — skipping read");
    return;
  }

  float rawMedian = readBatteryMedian();

  // Convert ADC to voltage
  float v_adc = (rawMedian / 4095.0f) * 3.3f;

  static constexpr float DIV_RATIO = 2.251f;  // measured Vtop/Vmid
  static constexpr float VBAT_K    = 0.972f;  // calibration vs multimeter

  float vbat = v_adc * DIV_RATIO * VBAT_K;

  // Anomaly detection: discard implausible readings
  if (vbat > V_BAT_IMPLAUSIBLE) {
    Serial.printf("[VBAT] Implausible reading %.3fV > %.2fV — discarded\n", vbat, V_BAT_IMPLAUSIBLE);
    return;
  }

  // EMA smoothing
  vbat = emaVbat(vbat);

  lastVbatV   = vbat;
  lastVbatPct = constrain(vbatToPercent(lastVbatV), 0, 100);

  // --- Hysteresis level detection ---
  BattLevel newLevel = battLevel;  // start with current level

  switch (battLevel) {
    case BATT_NORMAL:
      if (lastVbatV <= V_CRIT_ENTER)      newLevel = BATT_CRITICAL;
      else if (lastVbatV <= V_LOW_ENTER)   newLevel = BATT_LOW;
      break;
    case BATT_LOW:
      if (lastVbatV <= V_CRIT_ENTER)       newLevel = BATT_CRITICAL;
      else if (lastVbatV >= V_LOW_EXIT)    newLevel = BATT_NORMAL;
      break;
    case BATT_CRITICAL:
      if (lastVbatV >= V_CRIT_EXIT)        newLevel = BATT_LOW;
      break;
  }

  if (newLevel != battLevel) {
    prevBattLevel = battLevel;
    BattLevel oldLevel = battLevel;
    battLevel = newLevel;
    logMsg("[VBAT] Level changed: " + String(battLevelStr(oldLevel))
         + " → " + String(battLevelStr(battLevel))
         + " (V=" + String(lastVbatV, 3) + "V)");
    publishBatteryLevelChanged(battLevel, oldLevel);
    publishStatus();
  }

  Serial.printf("[VBAT] median_raw=%.1f v_adc=%.3fV vbat=%.3fV pct=%d%% level=%s\n",
              rawMedian, v_adc, lastVbatV, lastVbatPct, battLevelStr(battLevel));
}

// ============================================================================
//  POWER MONITORING (Spec v19 §9)
// ============================================================================
static bool readAdapterPresentStable() {
  const int N = 10;
  const int TH = 7;
  int highCount = 0;

  for (int i = 0; i < N; i++) {
    if (digitalRead(PIN_ADAPTER_PRESENT) == HIGH) highCount++;
    delay(20);
  }

  return highCount >= TH;
}

static void powerUpdate() {
  bool instant = (digitalRead(PIN_ADAPTER_PRESENT) == HIGH);

  if (instant == adapterPresentPrev) {
    adapterPresent = instant;
  } else {
    adapterPresent = readAdapterPresentStable();
  }

  if (adapterPresent != adapterPresentPrev) {
    adapterPresentPrev = adapterPresent;
    sourceChangeMs = millis();  // gating: mark power source change time

    // Read battery after settling (will be gated for POST_SOURCE_CHANGE_SETTLE_MS)
    logMsg("[POWER] Source changed → " + String(adapterPresent ? "MAINS" : "BATTERY"));
    publishPowerSourceChanged(adapterPresent);
    publishStatus();
  }

  // Periodic battery voltage read
  uint32_t now = millis();
  if (now - lastVbatReadMs >= VBAT_READ_INTERVAL_MS) {
    lastVbatReadMs = now;
    readBatteryVoltage();
  }
}

// ============================================================================
//  NETWORK POWER SAVING POLICY (Spec v19 §2.6)
// ============================================================================
static void updateNetPolicy() {
  NetPolicy newPolicy;

  if (sirenState == SIREN_ON_ACTIVE) {
    newPolicy = NET_ALARM_ACTIVE;
  } else if (sirenState == SIREN_COOLDOWN) {
    newPolicy = NET_COOLDOWN_HOLD;
  } else if (threatScore > 0.001f) {
    newPolicy = NET_PREWAKE;
  } else {
    newPolicy = NET_IDLE_SAVE;
  }

  if (newPolicy != netPolicy) {
    netPolicy = newPolicy;
    if (netPolicy == NET_IDLE_SAVE) {
      WiFi.setSleep(true);
      logMsg("[NET] Policy → IDLE_SAVE (modem sleep enabled)");
    } else {
      WiFi.setSleep(false);
      logMsg("[NET] Policy → " + String(netPolicyStr(netPolicy)));
    }
  }
}

// ============================================================================
//  MQTT COMMAND HANDLER
// ============================================================================
static void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  msg.trim();

  logMsg("[MQTT] CMD received: " + msg);

  // ---- ARM ----
  if (msg.indexOf("\"ARM\"") >= 0 && msg.indexOf("\"DISARM\"") < 0) {
    systemState = STATE_ARMED;
    threatScore = 0.0f;
    logMsg("[STATE] ARMED");
    publishArmEvent();
    publishStatus();
  }
  // ---- DISARM ----
  else if (msg.indexOf("\"DISARM\"") >= 0) {
    systemState = STATE_DISARMED;
    threatScore = 0.0f;
    if (sirenState == SIREN_ON_ACTIVE) {
      sirenOff();
      sirenState = SIREN_OFF;
      sirenOffMs = millis();
    }
    logMsg("[STATE] DISARMED");
    publishDisarmEvent();
    publishStatus();
  }
  // ---- CALIB_START / CALIB_KNOCK_START (Spec v19 §7 — Two-Stage) ----
  else if (msg.indexOf("\"CALIB_START\"") >= 0 || msg.indexOf("\"CALIB_KNOCK_START\"") >= 0) {
    calibStart();
  }
  // ---- SIREN_SILENCE (Spec v19 §8.3) ----
  else if (msg.indexOf("\"SIREN_SILENCE\"") >= 0) {
    String issuedBy = "dashboard";
    int byIdx = msg.indexOf("\"issued_by\"");
    if (byIdx >= 0) {
      int q1 = msg.indexOf(':', byIdx);
      int q2 = msg.indexOf('"', q1 + 1);
      int q3 = msg.indexOf('"', q2 + 1);
      if (q2 >= 0 && q3 > q2) {
        issuedBy = msg.substring(q2 + 1, q3);
      }
    }
    sirenSilence(issuedBy);
  }
  // ---- STATUS ----
  else if (msg.indexOf("\"STATUS\"") >= 0) {
    publishStatus();
  }
  else {
    logMsg("[MQTT] Unknown command: " + msg);
  }
}

static void mqttReconnect() {
  if (mqtt.connected()) return;

  uint32_t now = millis();
  if (now - lastMqttReconnectAttempt < 5000) return;
  lastMqttReconnectAttempt = now;

  logMsg("[MQTT] Connecting to " + String(MQTT_BROKER) + ":" + String(MQTT_PORT));

  String clientId = "door-" + String(DEVICE_ID) + "-" + String(random(1000));

  bool connected;
  if (strlen(MQTT_USER) > 0) {
    connected = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  } else {
    connected = mqtt.connect(clientId.c_str());
  }

  if (connected) {
    logMsg("[MQTT] Connected.");
    mqtt.subscribe(TOPIC_CMD);
    logMsg("[MQTT] Subscribed to " + String(TOPIC_CMD));
    publishStatus();
  } else {
    logMsg("[MQTT] Connect failed, rc=" + String(mqtt.state()));
  }
}

// ============================================================================
//  SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("============================================");
  Serial.println(" Warehouse Door Security System v3.0");
  Serial.println(" XIAO ESP32-S3 + MPU6050 + Reed Switch");
  Serial.println(" Spec: SECURITY_SYSTEM_SPEC v19");
  Serial.println(" Threat Model: Leaky Bucket (S_ALARM=2.0)");
  Serial.println("============================================");

  // --- Pin Setup ---
  pinMode(PIN_SIREN, OUTPUT);
  digitalWrite(PIN_SIREN, LOW);

  pinMode(PIN_DOOR_SWITCH, INPUT_PULLUP);
  pinMode(PIN_ADAPTER_PRESENT, INPUT);
  pinMode(PIN_VBAT_SENSE, INPUT);

  // --- Disable SIM800L module to save power ---
  pinMode(PIN_SIM800L_TX, OUTPUT);
  pinMode(PIN_SIM800L_RX, OUTPUT);
  digitalWrite(PIN_SIM800L_TX, LOW);
  digitalWrite(PIN_SIM800L_RX, LOW);
  logMsg("[SIM800L] Pins D6/D7 driven LOW — module disabled.");

  // --- Load calibration from NVS ---
  loadParamsFromNVS();

  // --- I2C + MPU6050 ---
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!mpu.begin()) {
    logMsg("[MPU] NOT FOUND! Check wiring (SDA=D4, SCL=D5).");
  } else {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    logMsg("[MPU] Initialized. Range=+-8g");
  }

  // --- Initial door state ---
  doorClosed     = (digitalRead(PIN_DOOR_SWITCH) == LOW);
  doorClosedPrev = doorClosed;
  logMsg("[DOOR] Initial: " + String(doorClosed ? "CLOSED" : "OPEN"));

  // --- Initial power state (non-gated initial read) ---
  adapterPresent     = (digitalRead(PIN_ADAPTER_PRESENT) == HIGH);
  adapterPresentPrev = adapterPresent;
  // Force an initial battery read (bypass gating)
  {
    float rawMedian = readBatteryMedian();
    float v_adc = (rawMedian / 4095.0f) * 3.3f;
    float vbat = v_adc * 2.251f * 0.972f;
    lastVbatV = emaVbat(vbat);
    lastVbatPct = constrain(vbatToPercent(lastVbatV), 0, 100);
  }
  logMsg("[POWER] Initial: " + String(adapterPresent ? "MAINS" : "BATTERY")
       + " Vbat=" + String(lastVbatV, 2) + "V (" + String(lastVbatPct) + "%)");

  // --- WiFi ---
  wifiConnect();

  // --- NTP ---
  ntpSync();

  // --- MQTT (TLS) ---
  wifiSecureClient.setInsecure();
  buildTopics();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);

  // --- Init timing ---
  nextImuTick       = millis();
  lastVbatReadMs    = millis();
  lastStatusPublish = millis();
  lastDecayMs       = millis();
  lastHitTs         = 0;
  sirenOffMs        = 0;
  sourceChangeMs    = 0;

  logMsg("[SYS] System ready. State=DISARMED. Send ARM command to activate.");
  logMsg("[SYS] TH_HIT=" + String(TH_HIT, 4) + " S_ALARM=" + String(S_ALARM, 2)
       + " LAMBDA=" + String(LAMBDA, 4) + "/s");
}

// ============================================================================
//  MAIN LOOP
// ============================================================================
void loop() {
  // --- WiFi reconnect ---
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnect();
    if (WiFi.status() == WL_CONNECTED && !ntpSynced) {
      ntpSync();
    }
  }

  // --- MQTT ---
  if (!mqtt.connected()) {
    mqttReconnect();
  }
  mqtt.loop();

  // --- Siren state machine ---
  sirenUpdate();

  // --- Door switch ---
  doorUpdate();

  // --- Power / battery monitoring ---
  powerUpdate();

  // --- Network power saving policy ---
  updateNetPolicy();

  // --- IMU sampling @100Hz (Spec v19 §5.1) ---
  if ((int32_t)(millis() - nextImuTick) >= 0) {
    nextImuTick += IMU_SAMPLE_MS;

    float delta = readDeltaG();

    // Decay threat score every tick
    decayThreatScore();

    // Calibration processing
    if (calibState == CALIB_NOISE) {
      calibProcessNoiseSample(delta);
    } else if (calibState == CALIB_KNOCK) {
      calibProcessKnockSample(delta);
    }

    // Hit detection (only when ARMED + CLOSED + not calibrating)
    processHit(delta);
  }

  // --- Periodic status heartbeat ---
  if (millis() - lastStatusPublish >= STATUS_INTERVAL_MS) {
    lastStatusPublish = millis();
    publishStatus();
  }
}
