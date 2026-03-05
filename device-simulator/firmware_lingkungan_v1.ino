/**
 * ============================================================================
 * Warehouse Environmental Monitoring System — ESP32 Firmware
 * ============================================================================
 * 
 * Sensor: DHT22 (Temperature + Humidity), MQ-135 (CO2/Air Quality)
 * Actuators: Fan (Relay 1), Dehumidifier (Relay 2)
 * Protocol: MQTT over TLS (mqtts://broker:8883)
 * 
 * MQTT Topics:
 *   Publish:  warehouses/{wId}/areas/{aId}/devices/{dId}/sensors/lingkungan
 *   Publish:  warehouses/{wId}/areas/{aId}/devices/{dId}/status
 *   Subscribe: warehouses/{wId}/areas/{aId}/devices/{dId}/commands
 * 
 * Hybrid Control Logic (3 Layers):
 *   Level 1 (Highest): Manual dashboard commands (5-min override)
 *   Level 2: Firmware safety — turn OFF if T<30, H<75, CO2<1200
 *   Level 3: ML prediction triggers from backend
 * 
 * Version: 1.0
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// --- PIN DEFINITIONS ---
#define MQ135_PIN       34    
#define FAN_RELAY_PIN   27    
#define SERVO_PIN       26    
#define STATUS_LED_PIN  2     

// ============================================================================
// Configuration — CHANGE THESE
// ============================================================================

// --- CONFIGURATION ---
const char* WIFI_SSID     = "anak hebat";
const char* WIFI_PASSWORD = "07112208";

// MQTT Broker
const char* MQTT_HOST     = "mfe19520.ala.asia-southeast1.emqxsl.com";
const int   MQTT_PORT     = 8883;
const char* MQTT_USERNAME = "device-5b9126c7-b5d3-469b-a6c0-34d2f559bb35";
const char* MQTT_PASSWORD = "pwd-5b9126c7-b5d3-469b-a6c0-34d2f559bb35-1772643381492";

// Device Identity (set per device)
const char* WAREHOUSE_ID  = "eec544fc-bacb-4568-bc46-594ed5b5616f";
const char* AREA_ID       = "4eb04ea1-865c-4043-a982-634ed59f6c7e";
const char* DEVICE_ID     = "5b9126c7-b5d3-469b-a6c0-34d2f559bb35";

// ============================================================================
// Safety Thresholds (Level 2 — Firmware)
// ============================================================================

const float SAFE_TEMP_MAX       = 30.0;   // Turn OFF if below
const float SAFE_HUMIDITY_MAX   = 75.0;   // Turn OFF if below
const float SAFE_CO2_MAX        = 1200.0; // Turn OFF if below

// ============================================================================
// Timing Constants
// ============================================================================

const unsigned long SENSOR_INTERVAL = 60000;  // 1 minute (1 reading per minute for ML)
const unsigned long HEARTBEAT_INTERVAL_MS     = 60000;   // 1 minute
const unsigned long OVERRIDE_DURATION = 300000; // 5 minutes
const unsigned long WIFI_RECONNECT_INTERVAL   = 10000;   // 10 seconds
const unsigned long MQTT_RECONNECT_INTERVAL   = 5000;    // 5 seconds

// ============================================================================
// MQ-135 Calibration Constants
// ============================================================================

// Approximate CO2 PPM conversion from raw ADC
// These should be calibrated per sensor unit. Rough formula:
// PPM = BASE_PPM + (adcValue / 4095.0) * PPM_RANGE
const float CO2_BASE_PPM    = 400.0;
const float CO2_PPM_RANGE   = 2000.0;   // Max ~2400 ppm at full ADC
const int   ADC_SAMPLES     = 10;        // Number of ADC readings to average

// ============================================================================
// Global Objects
// ============================================================================

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClientSecure espClient;
PubSubClient mqtt(espClient);

// ============================================================================
// MQTT Topics (built at runtime)
// ============================================================================

char topicSensor[200];
char topicStatus[200];
char topicCommand[200];

// ============================================================================
// State Variables
// ============================================================================

// Sensor readings
float currentTemp     = 0.0;
float currentHumidity = 0.0;
float currentCO2      = 0.0;

Adafruit_SHT31 sht31 = Adafruit_SHT31();

// Actuator states
bool fanOn           = false;
bool dehumidifierOn  = false;
Servo myServo;

// Control mode
enum ControlMode { AUTO_MODE, MANUAL_MODE };
ControlMode controlMode = AUTO_MODE;
unsigned long manualOverrideStartTime = 0;

// Timers
unsigned long lastSensorRead   = 0;
unsigned long lastHeartbeat    = 0;
unsigned long lastWifiReconnect = 0;
unsigned long lastMqttReconnect = 0;

// ============================================================================
// Setup
// ============================================================================

void setup() {
  Serial.begin(115200);
  
  // pin configuration
  pinMode(FAN_RELAY_PIN, OUTPUT);
  digitalWrite(FAN_RELAY_PIN, HIGH); // relay off
  pinMode(STATUS_LED_PIN, OUTPUT);

  // servo initialization for dehumidifier (handled later)

  if (!sht31.begin(0x44)) {
    Serial.println("[ERROR] SHT31 Failure!");
    while (1) delay(1);
  }

  // Build MQTT topics
  snprintf(topicSensor, sizeof(topicSensor),
    "warehouses/%s/areas/%s/devices/%s/sensors/lingkungan",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus),
    "warehouses/%s/areas/%s/devices/%s/status",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(topicCommand, sizeof(topicCommand),
    "warehouses/%s/areas/%s/devices/%s/commands",
    WAREHOUSE_ID, AREA_ID, DEVICE_ID);


  // Connect WiFi
  connectWiFi();

  // Configure MQTT
  espClient.setInsecure(); // Skip TLS cert verification (use setCACert in prod)
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);

  connectMQTT();

  // servo initialization for dehumidifier
  ESP32PWM::allocateTimer(0);
  myServo.setPeriodHertz(50);
  myServo.attach(SERVO_PIN, 500, 2400);
  myServo.write(0);

}

// ============================================================================
// Main Loop
// ============================================================================

void loop() {
  unsigned long now = millis();

  // Maintain connections
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiReconnect >= WIFI_RECONNECT_INTERVAL) {
      lastWifiReconnect = now;
      connectWiFi();
    }
    return; // Don't proceed without WiFi
  }

  if (!mqtt.connected()) {
    if (now - lastMqttReconnect >= MQTT_RECONNECT_INTERVAL) {
      lastMqttReconnect = now;
      connectMQTT();
    }
    return;
  }

  mqtt.loop();

  // Check manual override expiry
  if (controlMode == MANUAL_MODE) {
    if (now - manualOverrideStartTime >= MANUAL_OVERRIDE_DURATION) {
          controlMode = AUTO_MODE;
    }
  }

  // Read sensors periodically
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    readSensors();
    publishSensorData();

    // Apply firmware safety logic (Level 2) only in AUTO mode
    if (controlMode == AUTO_MODE) {
      applySafetyLogic();
    }
  }

  // Send heartbeat periodically
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    publishHeartbeat();
  }
}

// ============================================================================
// WiFi Connection
// ============================================================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ============================================================================
// MQTT Connection & Callback
// ============================================================================

void connectMQTT() {

  String clientId = "esp32-lingkungan-" + String(DEVICE_ID).substring(0, 8);

  if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {

    // Subscribe to command topic
    mqtt.subscribe(topicCommand, 1);

    // Publish initial heartbeat
    publishHeartbeat();
  } else {
  }
}

/**
 * MQTT Callback — handles incoming commands from dashboard/backend.
 * 
 * Expected JSON payloads:
 *   {"fan": "ON"}           - Turn fan on (manual)
 *   {"fan": "OFF"}          - Turn fan off (manual)
 *   {"dehumidifier": "ON"}  - Turn dehumidifier on (manual)
 *   {"dehumidifier": "OFF"} - Turn dehumidifier off (manual)
 *   {"fan": "ON", "dehumidifier": "ON"}  - Both
 *   {"mode": "AUTO"}        - Switch back to auto mode
 * 
 * ML-triggered commands (from backend Level 3):
 *   {"fan": "ON", "source": "ml"}
 */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Parse JSON
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);

  if (err) {
    return;
  }


  // Check if switching to AUTO mode
  if (doc.containsKey("mode")) {
    const char* mode = doc["mode"];
    if (strcmp(mode, "AUTO") == 0) {
      controlMode = AUTO_MODE;
      return;
    }
  }

  // Determine source: manual dashboard vs ML-driven
  const char* source = doc["source"] | "manual";
  bool isManual = (strcmp(source, "manual") == 0) || (strcmp(source, "dashboard") == 0);
  bool isML = (strcmp(source, "ml") == 0);

  if (isManual) {
    // Level 1: Manual control — highest priority, 5-minute override
    controlMode = MANUAL_MODE;
    manualOverrideStartTime = millis();
  } else if (isML && controlMode == MANUAL_MODE) {
    // ML commands are ignored during manual override
    return;
  }

  // Process actuator commands
  if (doc.containsKey("fan")) {
    const char* fanCmd = doc["fan"];
    bool turnOn = (strcmp(fanCmd, "ON") == 0);
    setFan(turnOn);
    Serial.printf("[ACTUATOR] Fan: %s (source: %s)\n", fanCmd, source);
  }

  if (doc.containsKey("dehumidifier")) {
    const char* dehumCmd = doc["dehumidifier"];
    bool turnOn = (strcmp(dehumCmd, "ON") == 0);
    setDehumidifier(turnOn);
    Serial.printf("[ACTUATOR] Dehumidifier: %s (source: %s)\n", dehumCmd, source);
  }

  // Publish updated status immediately
  publishHeartbeat();
}

// ============================================================================
// Sensor Reading
// ============================================================================

void readSensors() {
    // Read SHT31
  float temp = sht31.readTemperature();
  float hum  = sht31.readHumidity();

  if (!isnan(temp) && !isnan(hum)) {
    currentTemp     = temp;
    currentHumidity = hum;
  } else {
    Serial.println("[SENSOR] SHT31 read failed!");
  }

  // Read MQ-135 (average multiple samples)
  long adcSum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) {
    adcSum += analogRead(MQ135_PIN);
    delay(10);
  }
  float adcAvg = (float)adcSum / ADC_SAMPLES;
  currentCO2 = CO2_BASE_PPM + (adcAvg / 4095.0) * CO2_PPM_RANGE;

  Serial.printf("[SENSOR] T=%.1f°C  H=%.1f%%  CO2=%.0fppm (ADC=%.0f)\n",
    currentTemp, currentHumidity, currentCO2, adcAvg);
}

// ============================================================================
// MQTT Publishing
// ============================================================================

void publishSensorData() {
  StaticJsonDocument<256> doc;
  doc["temperature"] = round2(currentTemp);
  doc["humidity"]    = round2(currentHumidity);
  doc["co2"]         = round2(currentCO2);
  doc["fan"]         = fanOn ? "ON" : "OFF";
  doc["dehumidifier"] = dehumidifierOn ? "ON" : "OFF";
  doc["mode"]        = (controlMode == AUTO_MODE) ? "AUTO" : "MANUAL";

  char buffer[256];
  serializeJson(doc, buffer);

  if (mqtt.publish(topicSensor, buffer, true)) {
    Serial.printf("[MQTT] Published sensor data: %s\n", buffer);
  } else {
    Serial.println("[MQTT] Failed to publish sensor data!");
  }
}

void publishHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["status"]       = "online";
  doc["fan"]          = fanOn ? "ON" : "OFF";
  doc["dehumidifier"] = dehumidifierOn ? "ON" : "OFF";
  doc["mode"]         = (controlMode == AUTO_MODE) ? "AUTO" : "MANUAL";
  doc["temperature"]  = round2(currentTemp);
  doc["humidity"]     = round2(currentHumidity);
  doc["co2"]          = round2(currentCO2);
  doc["uptime_sec"]   = millis() / 1000;
  doc["rssi"]         = WiFi.RSSI();

  char buffer[256];
  serializeJson(doc, buffer);

  mqtt.publish(topicStatus, buffer, true);
  Serial.printf("[MQTT] Heartbeat: %s\n", buffer);
}

// ============================================================================
// Actuator Control
// ============================================================================

void setFan(bool on) {
  fanOn = on;
  digitalWrite(FAN_RELAY_PIN, on ? HIGH : LOW);
}

void setDehumidifier(bool on) {
  dehumidifierOn = on;
  // move servo to ON or OFF angle
  if (on) {
    myServo.write(90);  // adjust as needed
  } else {
    myServo.write(0);
  }
  delay(500);
}

// ============================================================================
// Level 2: Firmware Safety Logic
// ============================================================================

/**
 * If ALL conditions are below safety thresholds, turn OFF actuators.
 * This runs only in AUTO mode.
 */
void applySafetyLogic() {
  if (currentTemp < SAFE_TEMP_MAX &&
      currentHumidity < SAFE_HUMIDITY_MAX &&
      currentCO2 < SAFE_CO2_MAX) {

    if (fanOn || dehumidifierOn) {
      Serial.println("[SAFETY] All readings below thresholds. Turning OFF actuators.");
      setFan(false);
      setDehumidifier(false);
      publishHeartbeat(); // Notify backend of state change
    }
  }
}

// ============================================================================
// Utility
// ============================================================================

float round2(float value) {
  return round(value * 100.0) / 100.0;
}
