// ============================================================================
//  MPU6050 CALIBRATION DATA COLLECTION FIRMWARE v2.0
//  Microcontroller: Seeed XIAO ESP32-S3
//  Sensors: MPU6050 (I²C), Reed Switch
//  Connectivity: WiFi + MQTT over TLS (EMQX Cloud) + HTTPS (Supabase REST)
//  Purpose: Collect vibration profile data for threshold calibration
//           Sessions A (ambient), B (single impact), C (chiseling), D (ramming)
//
//  Data Flow:
//    Sensor data  → Supabase REST API (HTTP POST) — high volume, avoids MQTT limits
//    Control/cmds → MQTT (EMQX Cloud TLS) — low volume commands & heartbeat
//
//  Dependencies:
//    - ArduinoJson v7 (install via Arduino Library Manager)
//    - Adafruit MPU6050 + Adafruit Unified Sensor
//    - PubSubClient
// ============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <time.h>

// ============================================================================
//  PIN MAPPING (XIAO ESP32-S3)
// ============================================================================
#define PIN_SDA           5   // D4
#define PIN_SCL           6   // D5
#define PIN_DOOR_SWITCH   4   // D3 (reed switch, INPUT_PULLUP, LOW = closed)
#define PIN_SIREN         8   // D9 — NOT USED, kept LOW
#define PIN_SIM800L_TX    43  // D6 — driven LOW to disable module
#define PIN_SIM800L_RX    44  // D7 — driven LOW to disable module

// ============================================================================
//  WIFI CONFIG — EDIT SESUAI JARINGAN ANDA
// ============================================================================
static const char* WIFI_SSID = "HUAWEI-3X5S";
static const char* WIFI_PASS = "Gr6TCfJ4";

// ============================================================================
//  MQTT CONFIG (control channel only)
// ============================================================================
static const char* MQTT_BROKER = "mfe19520.ala.asia-southeast1.emqxsl.com";
static const int   MQTT_PORT   = 8883;
static const char* MQTT_USER   = "device-8e819e4a-9710-491f-9fbc-741892ae6195";
static const char* MQTT_PASS   = "pwd-8e819e4a-9710-491f-9fbc-741892ae6195-1772377701318";

// ============================================================================
//  SUPABASE CONFIG (data channel — direct HTTP POST)
// ============================================================================
static const char* SUPABASE_URL  = "https://yjgguuekranauuvxjbkh.supabase.co";  // ← EDIT
static const char* SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZ2d1dWVrcmFuYXV1dnhqYmtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDU5NDgsImV4cCI6MjA4MDg4MTk0OH0.v5kvETnfvDNSUtg53qjBwfjkt66X6FlDyqEgshGzcSY";            // ← EDIT

// ============================================================================
//  DEVICE & TOPOLOGY CONFIG
// ============================================================================
static const char* DEVICE_ID    = "8e819e4a-9710-491f-9fbc-741892ae6195";
static const char* WAREHOUSE_ID = "eec544fc-bacb-4568-bc46-594ed5b5616f";
static const char* AREA_ID      = "4eb04ea1-865c-4043-a982-634ed59f6c7e";
static const char* CAL_DEVICE   = "xiao-s3-01"; // identifier for calibration tables

// ============================================================================
//  TIMING PARAMETERS
// ============================================================================
static constexpr uint32_t IMU_SAMPLE_MS         = 10;     // 100 Hz sampling
static constexpr uint32_t SUMMARY_INTERVAL_MS   = 5000;   // Session A: 5s summary
static constexpr uint32_t RAW_FLUSH_MS          = 500;    // Session B/C/D: flush every 500ms
static constexpr uint32_t HEARTBEAT_INTERVAL_MS = 15000;  // MQTT heartbeat every 15s
static constexpr uint32_t DOOR_RESUME_DELAY_MS  = 5000;   // Session A: auto-resume 5s after close
static constexpr int      RAW_BUFFER_SIZE       = 55;     // circular buffer for raw samples

// Feature: Countdown before recording (#4)
static constexpr uint32_t COUNTDOWN_MS          = 3000;   // 3-second countdown before START

// Feature: Auto-STOP on silence for Sessions B/C/D (#3)
static constexpr float    SILENCE_THRESHOLD     = 0.05f;  // Δg below this = silence
static constexpr uint32_t SILENCE_TIMEOUT_MS    = 5000;   // 5s of silence → auto-stop

// Feature: Retry queue for failed Supabase POSTs (#12)
static constexpr int      RETRY_MAX_ATTEMPTS    = 3;
static constexpr uint32_t RETRY_DELAY_MS        = 2000;   // backoff between retries
static constexpr int      RETRY_QUEUE_SIZE      = 5;      // max queued failed requests

// ============================================================================
//  STATE MACHINE
// ============================================================================
enum CalState { CAL_IDLE, CAL_RECORDING, CAL_PAUSED };

static CalState calState = CAL_IDLE;
static char     currentSession[4]  = "";   // "A", "B", "C", or "D"
static int      currentTrial       = 1;
static char     currentNote[128]   = "";

// ============================================================================
//  RUNTIME GLOBALS
// ============================================================================
// Raw sample buffer (for Sessions B/C/D)
struct RawSample {
  uint32_t ts;     // millis() timestamp
  float    deltaG;
};
static RawSample rawBuffer[RAW_BUFFER_SIZE];
static int rawBufCount = 0;

// Summary accumulator (for Session A)
static float  sumDg     = 0.0f;
static float  sumMin    = 999.0f;
static float  sumMax    = 0.0f;
static int    sumCount  = 0;
static uint32_t summaryStartMs = 0;

// Door state
static bool doorClosed     = true;
static bool doorClosedPrev = true;
static uint32_t doorClosedAtMs = 0; // when door last closed (for 5s delay)

// Timing
static uint32_t nextImuTick     = 0;
static uint32_t lastFlushMs     = 0;
static uint32_t lastHeartbeatMs = 0;
static uint32_t lastSummaryMs   = 0;

// Feature: Countdown (#4)
static bool     countdownActive  = false;
static uint32_t countdownStartMs = 0;

// Feature: Auto-STOP silence detection (#3)
static uint32_t lastSignificantHitMs = 0;  // last time Δg exceeded threshold
static bool     silenceDetectionEnabled = true; // can be toggled for Session A

// Feature: Retry queue (#12)
struct RetryItem {
  char   table[32];
  String body;
  int    attempts;
};
static RetryItem retryQueue[RETRY_QUEUE_SIZE];
static int retryQueueCount = 0;
static uint32_t lastRetryMs = 0;

// MQTT topics
static char TOPIC_STATUS[160];
static char TOPIC_CMD[160];
static uint32_t lastMqttReconnect = 0;

// NTP
static bool ntpSynced = false;

// Hardware
static Adafruit_MPU6050 mpu;
static WiFiClientSecure mqttWifiClient;
static PubSubClient mqtt(mqttWifiClient);

// ============================================================================
//  SUPABASE HTTP CLIENT — reuses WiFiClientSecure
// ============================================================================
// We use HTTPClient which handles its own TLS connection internally

static bool supabasePostRaw(const char* table, const String& jsonBody) {
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/" + table;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON);
  http.addHeader("Prefer", "return=minimal");

  int httpCode = http.POST(jsonBody);
  http.end();

  if (httpCode == 201 || httpCode == 200) {
    return true;
  } else {
    Serial.printf("[SUPA] POST %s failed: %d\n", table, httpCode);
    return false;
  }
}

// Feature #12: Retry queue — enqueue failed POST for later retry
static void enqueueRetry(const char* table, const String& body) {
  if (retryQueueCount >= RETRY_QUEUE_SIZE) {
    logMsg("[RETRY] Queue full — dropping oldest item");
    // Shift queue left
    for (int i = 0; i < RETRY_QUEUE_SIZE - 1; i++) {
      retryQueue[i] = retryQueue[i + 1];
    }
    retryQueueCount = RETRY_QUEUE_SIZE - 1;
  }
  strncpy(retryQueue[retryQueueCount].table, table, sizeof(retryQueue[0].table) - 1);
  retryQueue[retryQueueCount].body = body;
  retryQueue[retryQueueCount].attempts = 0;
  retryQueueCount++;
  logMsg("[RETRY] Enqueued POST to " + String(table) + " (queue: " + String(retryQueueCount) + ")");
}

static void processRetryQueue() {
  if (retryQueueCount == 0) return;
  uint32_t now = millis();
  if (now - lastRetryMs < RETRY_DELAY_MS) return;
  lastRetryMs = now;

  RetryItem& item = retryQueue[0];
  item.attempts++;
  logMsg("[RETRY] Attempt " + String(item.attempts) + "/" + String(RETRY_MAX_ATTEMPTS) + " for " + String(item.table));

  bool ok = supabasePostRaw(item.table, item.body);
  if (ok || item.attempts >= RETRY_MAX_ATTEMPTS) {
    if (!ok) logMsg("[RETRY] Gave up on " + String(item.table) + " after " + String(RETRY_MAX_ATTEMPTS) + " attempts");
    // Remove from queue (shift left)
    for (int i = 0; i < retryQueueCount - 1; i++) {
      retryQueue[i] = retryQueue[i + 1];
    }
    retryQueueCount--;
  }
}

// Wrapper: POST with automatic retry on failure
static bool supabasePost(const char* table, const String& jsonBody) {
  bool ok = supabasePostRaw(table, jsonBody);
  if (!ok) {
    enqueueRetry(table, jsonBody);
  }
  return ok;
}

// Feature #14: Connectivity check before START
static bool checkConnectivity() {
  if (WiFi.status() != WL_CONNECTED) {
    logMsg("[CHECK] WiFi not connected!");
    return false;
  }
  // Quick health check to Supabase
  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/";
  http.begin(url);
  http.addHeader("apikey", SUPABASE_ANON);
  int httpCode = http.GET();
  http.end();

  if (httpCode > 0 && httpCode < 500) {
    logMsg("[CHECK] Supabase reachable (HTTP " + String(httpCode) + ")");
    return true;
  } else {
    logMsg("[CHECK] Supabase unreachable (HTTP " + String(httpCode) + ")");
    return false;
  }
}

// ============================================================================
//  LOGGING + TIMESTAMPS
// ============================================================================
static void logMsg(const String& msg) {
  Serial.print("[");
  Serial.print(millis());
  Serial.print("] ");
  Serial.println(msg);
}

static String isoTimestamp() {
  if (ntpSynced) {
    time_t now;
    time(&now);
    struct tm ti;
    gmtime_r(&now, &ti);
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    return String(buf);
  }
  return String(millis());
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

static void ntpSync() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  logMsg("[NTP] Syncing...");
  struct tm timeinfo;
  if (getLocalTime(&timeinfo, 10000)) {
    ntpSynced = true;
    logMsg("[NTP] Time synced.");
  } else {
    logMsg("[NTP] Sync failed — using millis fallback.");
  }
}

// ============================================================================
//  IMU READING
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
//  SUPABASE DATA PUBLISHING
// ============================================================================

// Flush raw buffer to Supabase (Sessions B/C/D)
static void flushRawBuffer() {
  if (rawBufCount == 0) return;

  JsonDocument doc;
  JsonArray arr = doc.to<JsonArray>();
  
  for (int i = 0; i < rawBufCount; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["session"]   = currentSession;
    obj["trial"]     = currentTrial;
    obj["ts_device"] = rawBuffer[i].ts;
    obj["ts_iso"]    = isoTimestamp();
    obj["delta_g"]   = serialized(String(rawBuffer[i].deltaG, 6));
    obj["device_id"] = CAL_DEVICE;
    if (currentNote[0] != '\0') {
      obj["note"] = currentNote;
    }
  }

  String body;
  serializeJson(doc, body);
  
  bool ok = supabasePost("calibration_raw", body);
  if (ok) {
    logMsg("[DATA] Flushed " + String(rawBufCount) + " raw samples (session " + currentSession + ", trial " + String(currentTrial) + ")");
  }
  rawBufCount = 0;
}

// Publish summary to Supabase (Session A)
static void publishSummary() {
  if (sumCount == 0) return;

  float mean = sumDg / sumCount;
  uint32_t windowMs = millis() - summaryStartMs;

  JsonDocument doc;
  doc["session"]      = currentSession;
  doc["trial"]        = currentTrial;
  doc["summary_type"] = "periodic";
  doc["dg_min"]       = serialized(String(sumMin, 6));
  doc["dg_max"]       = serialized(String(sumMax, 6));
  doc["dg_mean"]      = serialized(String(mean, 6));
  doc["n_samples"]    = sumCount;
  doc["window_ms"]    = windowMs;
  doc["device_id"]    = CAL_DEVICE;

  String body;
  serializeJson(doc, body);

  bool ok = supabasePost("calibration_summary", body);
  if (ok) {
    logMsg("[DATA] Summary: min=" + String(sumMin, 4) + " max=" + String(sumMax, 4)
         + " mean=" + String(mean, 4) + " n=" + String(sumCount));
  }

  // Reset accumulator
  sumDg    = 0.0f;
  sumMin   = 999.0f;
  sumMax   = 0.0f;
  sumCount = 0;
  summaryStartMs = millis();
}

// Publish marker to Supabase
static void publishMarker(const char* label) {
  JsonDocument doc;
  doc["session"]   = currentSession;
  doc["trial"]     = currentTrial;
  doc["ts_device"] = (unsigned long)millis();
  doc["ts_iso"]    = isoTimestamp();
  doc["delta_g"]   = 0;
  doc["marker"]    = label;
  doc["device_id"] = CAL_DEVICE;

  String body;
  serializeJson(doc, body);
  supabasePost("calibration_raw", body);
  logMsg("[MARKER] " + String(label));
}

// Publish device status heartbeat to Supabase
static void publishDeviceStatusToSupabase() {
  JsonDocument doc;
  doc["session"]    = currentSession[0] != '\0' ? (const char*)currentSession : "none";
  doc["recording"]  = (calState == CAL_RECORDING);
  doc["trial"]      = currentTrial;
  doc["uptime_sec"] = (unsigned long)(millis() / 1000);
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["free_heap"]  = (int)ESP.getFreeHeap();
  doc["offline_buf"] = rawBufCount;
  doc["door_state"] = doorClosed ? "CLOSED" : "OPEN";
  doc["device_id"]  = DEVICE_ID;

  String body;
  serializeJson(doc, body);
  supabasePost("calibration_device_status", body);
}

// ============================================================================
//  MQTT — CONTROL CHANNEL
// ============================================================================

static void buildTopics() {
  snprintf(TOPIC_STATUS, sizeof(TOPIC_STATUS),
    "warehouses/%s/areas/%s/devices/%s/status",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(TOPIC_CMD, sizeof(TOPIC_CMD),
    "warehouses/%s/areas/%s/devices/%s/commands",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
}

static void mqttPublish(const char* topic, const String& payload) {
  if (mqtt.connected()) {
    mqtt.publish(topic, payload.c_str(), false);
    logMsg("[MQTT] PUB → " + payload.substring(0, 120));
  }
}

static void publishHeartbeat() {
  JsonDocument doc;
  doc["device_id"]  = DEVICE_ID;
  doc["cal_state"]  = (calState == CAL_RECORDING) ? "RECORDING" :
                      (calState == CAL_PAUSED)    ? "PAUSED" : "IDLE";
  doc["session"]    = currentSession[0] != '\0' ? (const char*)currentSession : "none";
  doc["trial"]      = currentTrial;
  doc["door"]       = doorClosed ? "CLOSED" : "OPEN";
  doc["uptime_sec"] = (unsigned long)(millis() / 1000);
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["free_heap"]  = (int)ESP.getFreeHeap();
  doc["ts"]         = isoTimestamp();

  String body;
  serializeJson(doc, body);
  mqttPublish(TOPIC_STATUS, body);

  // Also save to Supabase for persistent status tracking
  publishDeviceStatusToSupabase();
}

static void publishEvent(const char* event) {
  JsonDocument doc;
  doc["device_id"]  = DEVICE_ID;
  doc["cal_state"]  = (calState == CAL_RECORDING) ? "RECORDING" :
                      (calState == CAL_PAUSED)    ? "PAUSED" : "IDLE";
  doc["session"]    = currentSession[0] != '\0' ? (const char*)currentSession : "none";
  doc["trial"]      = currentTrial;
  doc["door"]       = doorClosed ? "CLOSED" : "OPEN";
  doc["event"]      = event;
  doc["ts"]         = isoTimestamp();

  String body;
  serializeJson(doc, body);
  mqttPublish(TOPIC_STATUS, body);
}

// ============================================================================
//  STATE MACHINE TRANSITIONS
// ============================================================================

static void startRecording() {
  if (currentSession[0] == '\0') {
    logMsg("[STATE] Cannot start — no session configured. Send SET_SESSION first.");
    publishEvent("ERROR_NO_SESSION");
    return;
  }
  if (!doorClosed) {
    logMsg("[STATE] Cannot start — door is OPEN. Close the door first.");
    publishEvent("ERROR_DOOR_OPEN");
    return;
  }

  // Feature #14: Connectivity check
  if (!checkConnectivity()) {
    logMsg("[STATE] Cannot start — Supabase unreachable. Check WiFi/internet.");
    publishEvent("ERROR_NO_CONNECTIVITY");
    return;
  }

  // Feature #4: Start countdown (actual recording begins after COUNTDOWN_MS)
  // For Session A, skip countdown (long ambient recording doesn't need it)
  if (currentSession[0] != 'A') {
    countdownActive  = true;
    countdownStartMs = millis();
    logMsg("[STATE] COUNTDOWN 3s — Session " + String(currentSession) + " Trial " + String(currentTrial));
    publishEvent("COUNTDOWN_STARTED");
    return; // Actual recording starts in loop() after countdown
  }

  // Session A: start immediately (no countdown needed)
  beginRecording();
}

// Internal: actually begin recording (called after countdown or directly for Session A)
static void beginRecording() {
  calState = CAL_RECORDING;

  // Reset accumulators
  rawBufCount = 0;
  sumDg    = 0.0f;
  sumMin   = 999.0f;
  sumMax   = 0.0f;
  sumCount = 0;
  summaryStartMs = millis();
  lastFlushMs    = millis();
  lastSummaryMs  = millis();
  lastSignificantHitMs = millis(); // reset silence timer

  logMsg("[STATE] RECORDING — Session " + String(currentSession) + " Trial " + String(currentTrial));
  publishEvent("RECORDING_STARTED");
}

static void pauseRecording(const char* reason) {
  if (calState != CAL_RECORDING) return;

  // Flush any buffered data before pausing
  if (currentSession[0] == 'A') {
    publishSummary();
  } else {
    flushRawBuffer();
  }

  calState = CAL_PAUSED;
  logMsg("[STATE] PAUSED — " + String(reason));
  publishEvent("RECORDING_PAUSED");
}

static void stopRecording() {
  // Cancel countdown if active
  countdownActive = false;

  // Flush remaining data
  if (calState == CAL_RECORDING) {
    if (currentSession[0] == 'A') {
      publishSummary();
    } else {
      flushRawBuffer();
    }
  }

  calState = CAL_IDLE;

  // Feature #1: Auto-increment trial for Sessions B/C/D
  if (currentSession[0] != 'A' && currentSession[0] != '\0') {
    currentTrial++;
    logMsg("[STATE] IDLE — Trial auto-incremented to " + String(currentTrial));
  } else {
    logMsg("[STATE] IDLE — Recording stopped");
  }
  publishEvent("RECORDING_STOPPED");
}

// ============================================================================
//  MQTT COMMAND HANDLER
// ============================================================================

static void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Parse JSON command
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    logMsg("[CMD] JSON parse error: " + String(err.c_str()));
    return;
  }

  const char* cmd = doc["cmd"] | "";
  logMsg("[CMD] Received: " + String(cmd));

  // --- SET_SESSION ---
  if (strcmp(cmd, "SET_SESSION") == 0) {
    const char* session = doc["session"] | "";
    if (session[0] == '\0' || (session[0] != 'A' && session[0] != 'B' && session[0] != 'C' && session[0] != 'D')) {
      logMsg("[CMD] Invalid session. Must be A, B, C, or D.");
      return;
    }
    strncpy(currentSession, session, sizeof(currentSession) - 1);
    currentSession[sizeof(currentSession) - 1] = '\0';
    currentTrial = doc["trial"] | 1;
    const char* note = doc["note"] | "";
    strncpy(currentNote, note, sizeof(currentNote) - 1);
    currentNote[sizeof(currentNote) - 1] = '\0';

    logMsg("[CMD] Session set: " + String(currentSession) + " Trial: " + String(currentTrial) + " Note: " + String(currentNote));
    publishEvent("SESSION_CONFIGURED");
  }

  // --- START ---
  else if (strcmp(cmd, "START") == 0) {
    startRecording();
  }

  // --- STOP ---
  else if (strcmp(cmd, "STOP") == 0) {
    stopRecording();
  }

  // --- MARK ---
  else if (strcmp(cmd, "MARK") == 0) {
    const char* label = doc["label"] | "mark";
    if (calState == CAL_RECORDING || calState == CAL_PAUSED) {
      publishMarker(label);
    } else {
      logMsg("[CMD] MARK ignored — not recording.");
    }
  }

  // --- RECAL ---
  else if (strcmp(cmd, "RECAL") == 0) {
    logMsg("[CAL] Recalibrating baseline...");
    // Read 300 samples over 3 seconds to establish baseline
    float sum = 0.0f;
    const int N = 300;
    for (int i = 0; i < N; i++) {
      sum += readDeltaG();
      delay(10);
    }
    float baseline = sum / N;
    logMsg("[CAL] Baseline Δg = " + String(baseline, 6) + " (from " + String(N) + " samples)");
    publishEvent("RECALIBRATED");
  }

  // --- Unknown ---
  else {
    logMsg("[CMD] Unknown command: " + String(cmd));
  }
}

static void mqttReconnect() {
  if (mqtt.connected()) return;

  uint32_t now = millis();
  if (now - lastMqttReconnect < 5000) return;
  lastMqttReconnect = now;

  logMsg("[MQTT] Connecting to " + String(MQTT_BROKER));

  String clientId = "cal-" + String(DEVICE_ID).substring(0, 8) + "-" + String(random(1000));

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
    publishHeartbeat();
  } else {
    logMsg("[MQTT] Failed, rc=" + String(mqtt.state()));
  }
}

// ============================================================================
//  DOOR (REED SWITCH) MONITORING
// ============================================================================

static void doorUpdate() {
  doorClosed = (digitalRead(PIN_DOOR_SWITCH) == LOW);

  if (doorClosed != doorClosedPrev) {
    doorClosedPrev = doorClosed;

    if (!doorClosed) {
      // Door opened — pause recording
      logMsg("[DOOR] OPENED");
      if (calState == CAL_RECORDING) {
        pauseRecording("Door opened");
      }
      publishEvent("DOOR_OPENED");
    } else {
      // Door closed
      doorClosedAtMs = millis();
      logMsg("[DOOR] CLOSED");
      publishEvent("DOOR_CLOSED");
    }
  }

  // Session A: auto-resume 5 seconds after door closes
  if (calState == CAL_PAUSED && doorClosed && currentSession[0] == 'A') {
    if (millis() - doorClosedAtMs >= DOOR_RESUME_DELAY_MS) {
      logMsg("[STATE] Auto-resuming Session A (door closed for 5s)");
      startRecording();
    }
  }
}

// ============================================================================
//  SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("============================================");
  Serial.println(" MPU6050 Calibration Data Collection v2.0");
  Serial.println(" XIAO ESP32-S3 + Supabase REST + MQTT Ctrl");
  Serial.println(" Sessions: A(ambient) B(impact) C(chisel) D(ram)");
  Serial.println("============================================");

  // --- Pin Setup ---
  pinMode(PIN_SIREN, OUTPUT);
  digitalWrite(PIN_SIREN, LOW);

  pinMode(PIN_DOOR_SWITCH, INPUT_PULLUP);

  // Disable SIM800L
  pinMode(PIN_SIM800L_TX, OUTPUT);
  pinMode(PIN_SIM800L_RX, OUTPUT);
  digitalWrite(PIN_SIM800L_TX, LOW);
  digitalWrite(PIN_SIM800L_RX, LOW);
  logMsg("[SIM800L] Disabled (D6/D7 LOW)");

  // --- I2C + MPU6050 ---
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!mpu.begin()) {
    logMsg("[MPU] NOT FOUND! Check wiring (SDA=D4, SCL=D5).");
    while (1) delay(1000);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  logMsg("[MPU] Initialized. Range=±8g, BW=21Hz");

  // --- Initial door state ---
  doorClosed     = (digitalRead(PIN_DOOR_SWITCH) == LOW);
  doorClosedPrev = doorClosed;
  doorClosedAtMs = millis();
  logMsg("[DOOR] Initial: " + String(doorClosed ? "CLOSED" : "OPEN"));

  // --- WiFi ---
  wifiConnect();

  // --- NTP ---
  ntpSync();

  // --- MQTT ---
  mqttWifiClient.setInsecure(); // skip cert validation for prototype
  buildTopics();
  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);

  // --- Init timing ---
  nextImuTick     = millis();
  lastFlushMs     = millis();
  lastHeartbeatMs = millis();
  lastSummaryMs   = millis();
  summaryStartMs  = millis();

  logMsg("[SYS] Ready. State=IDLE. Send SET_SESSION + START via MQTT to begin.");
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

  // --- Door monitoring ---
  doorUpdate();

  // --- Feature #4: Countdown timer ---
  if (countdownActive) {
    uint32_t elapsed = millis() - countdownStartMs;
    if (elapsed >= COUNTDOWN_MS) {
      countdownActive = false;
      beginRecording();
    }
    // Skip IMU sampling during countdown
    goto postSampling;
  }

  // --- IMU sampling @ 100Hz ---
  if (calState == CAL_RECORDING && (int32_t)(millis() - nextImuTick) >= 0) {
    nextImuTick += IMU_SAMPLE_MS;

    float dg = readDeltaG();

    if (currentSession[0] == 'A') {
      // Session A: accumulate for summary
      sumDg += dg;
      if (dg < sumMin) sumMin = dg;
      if (dg > sumMax) sumMax = dg;
      sumCount++;
    } else {
      // Sessions B/C/D: buffer raw samples
      if (rawBufCount < RAW_BUFFER_SIZE) {
        rawBuffer[rawBufCount].ts     = millis();
        rawBuffer[rawBufCount].deltaG = dg;
        rawBufCount++;
      }
      // Buffer full — flush immediately
      if (rawBufCount >= RAW_BUFFER_SIZE) {
        flushRawBuffer();
      }

      // Feature #3: Silence detection for auto-stop
      if (silenceDetectionEnabled) {
        if (dg >= SILENCE_THRESHOLD) {
          lastSignificantHitMs = millis();
        }
        if (millis() - lastSignificantHitMs >= SILENCE_TIMEOUT_MS) {
          logMsg("[AUTO-STOP] Silence detected for " + String(SILENCE_TIMEOUT_MS / 1000) + "s — auto-stopping");
          publishEvent("AUTO_STOPPED_SILENCE");
          stopRecording();
        }
      }
    }
  }

postSampling:
  uint32_t now = millis();

  // --- Session A: publish summary every 5 seconds ---
  if (calState == CAL_RECORDING && currentSession[0] == 'A') {
    if (now - lastSummaryMs >= SUMMARY_INTERVAL_MS) {
      lastSummaryMs = now;
      publishSummary();
    }
  }

  // --- Sessions B/C/D: timed flush every 500ms ---
  if (calState == CAL_RECORDING && currentSession[0] != 'A') {
    if (now - lastFlushMs >= RAW_FLUSH_MS) {
      lastFlushMs = now;
      flushRawBuffer();
    }
  }

  // --- Feature #12: Process retry queue ---
  processRetryQueue();

  // --- Heartbeat every 15 seconds ---
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }
}
