/**
 * ============================================================================
 * Warehouse Environmental Monitoring System — ESP32 Firmware
 * ============================================================================
 * SENSORS   : SHT31 (I2C), MQ-135 (Analog)
 * ACTUATORS : Fan (Relay - Active Low), 2-in-1 Dehumidifier (Servo SG90)
 * LOGIC     : Hybrid 3-Level (Manual Override, Safety Off, ML Trigger)
 * ============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>

// --- PIN DEFINITIONS ---
#define MQ135_PIN       34    
#define FAN_RELAY_PIN   27    
#define SERVO_PIN       26    
#define STATUS_LED_PIN  2     

// --- CONFIGURATION ---
const char* WIFI_SSID     = "anak hebat";
const char* WIFI_PASSWORD = "07112208";

const char* MQTT_HOST     = "mfe19520.ala.asia-southeast1.emqxsl.com";
const int   MQTT_PORT     = 8883;
const char* MQTT_USERNAME = "device-5b9126c7-b5d3-469b-a6c0-34d2f559bb35";
const char* MQTT_PASSWORD = "pwd-5b9126c7-b5d3-469b-a6c0-34d2f559bb35-1772643381492";

const char* WAREHOUSE_ID  = "eec544fc-bacb-4568-bc46-594ed5b5616f";
const char* AREA_ID       = "4eb04ea1-865c-4043-a982-634ed59f6c7e";
const char* DEVICE_ID     = "5b9126c7-b5d3-469b-a6c0-34d2f559bb35";

// --- SAFETY OFF THRESHOLDS (LEVEL 2 - ACTUAL VALUES) ---
// Matikan aktuator hanya jika nilai AKTUAL di bawah angka ini
const float OFF_THRESHOLD_TEMP     = 30.0; 
const float OFF_THRESHOLD_HUMIDITY = 75.0; 
const float OFF_THRESHOLD_CO2      = 1200.0;

// --- TIMING ---
const unsigned long SENSOR_INTERVAL = 60000;    // 1 Menit
const unsigned long OVERRIDE_DURATION = 300000; // 5 Menit

// --- OBJECTS ---
Adafruit_SHT31 sht31 = Adafruit_SHT31();
LiquidCrystal_I2C lcd(0x27, 20, 4);
Servo dehumServo;
WiFiClientSecure espClient;
PubSubClient mqtt(espClient);

char topicSensor[200], topicStatus[200], topicCommand[200];

// --- STATE VARIABLES ---
float curTemp = 0, curHum = 0, curCO2 = 0;
bool fanState = false;   
bool dehumState = false; 
enum ControlMode { AUTO_MODE, MANUAL_MODE };
ControlMode currentMode = AUTO_MODE;
unsigned long manualStartTime = 0;
unsigned long lastSensorPub = 0;

// MQ-135 Calibration Constants
const float R_LOAD   = 10.0;
const float ATMO_CO2 = 427.09;
const float CO2_A    = 110.74;
const float CO2_B    = -2.862;
float Ro = 10.0;
float smoothedPPM = 400.0;

void setup() {
  Serial.begin(115200);
  
  lcd.init();
  lcd.backlight();
  lcd.print("SYSTEM STARTING...");

  pinMode(FAN_RELAY_PIN, OUTPUT);
  digitalWrite(FAN_RELAY_PIN, HIGH); // Relay OFF (Active Low)

  ESP32PWM::allocateTimer(0);
  dehumServo.setPeriodHertz(50);
  dehumServo.attach(SERVO_PIN, 500, 2400);
  dehumServo.write(0); 

  pinMode(STATUS_LED_PIN, OUTPUT);

  if (!sht31.begin(0x44)) {
    Serial.println("[ERROR] SHT31 Failure");
    lcd.setCursor(0,1); lcd.print("SHT31 ERROR!");
  }

  snprintf(topicSensor, 200, "warehouses/%s/areas/%s/devices/%s/sensors/lingkungan", WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(topicStatus, 200, "warehouses/%s/areas/%s/devices/%s/status", WAREHOUSE_ID, AREA_ID, DEVICE_ID);
  snprintf(topicCommand, 200, "warehouses/%s/areas/%s/devices/%s/commands", WAREHOUSE_ID, AREA_ID, DEVICE_ID);

  connectWiFi();
  espClient.setInsecure(); 
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  
  calibrateMQ135();
  lcd.clear();
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  // Reset Mode ke AUTO jika timer manual habis
  if (currentMode == MANUAL_MODE && (now - manualStartTime >= OVERRIDE_DURATION)) {
    currentMode = AUTO_MODE;
    Serial.println("[MODE] Override Expired. Switch to AUTO.");
    publishStatus();
  }

  // Rutinitas Sensor (1 Menit Sekali)
  if (now - lastSensorPub >= SENSOR_INTERVAL) {
    lastSensorPub = now;
    readSensors();
    
    // Level 2: Safety Off (Hanya jalan di mode AUTO agar tidak bentrok dengan Manual)
    if (currentMode == AUTO_MODE) {
       applySafetyOff();
    }
    
    publishData();
    updateLCD();
  }
}

void readSensors() {
  curTemp = sht31.readTemperature();
  curHum = sht31.readHumidity();
  
  float sum_a = 0;
  for(int i=0; i<32; i++) sum_a += analogRead(MQ135_PIN);
  float v_out = (sum_a / 32.0) * (3.3 / 4095.0);
  float rs = ((3.3 * R_LOAD) / v_out) - R_LOAD;
  float co2_raw = CO2_A * pow((rs/Ro), CO2_B);
  
  smoothedPPM = (co2_raw * 0.1) + (smoothedPPM * 0.9);
  curCO2 = (smoothedPPM < 400) ? 400 : smoothedPPM;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;

  const char* source = doc["source"] | "manual";
  bool isManual = (strcmp(source, "manual") == 0 || strcmp(source, "dashboard") == 0);
  bool isML = (strcmp(source, "ml") == 0);

  // Level 1: Prioritas Manual Dashboard
  if (isManual) {
    currentMode = MANUAL_MODE;
    manualStartTime = millis();
    Serial.println("[CONTROL] Manual Override Active.");
  } 
  // Abaikan perintah otomatis (ML) jika sedang mode manual
  else if (isML && currentMode == MANUAL_MODE) {
    Serial.println("[CONTROL] ML ignored during manual mode.");
    return;
  }

  if (doc.containsKey("fan")) {
    setFan(strcmp(doc["fan"], "ON") == 0);
  }

  if (doc.containsKey("dehumidifier")) {
    setDehumidifier(strcmp(doc["dehumidifier"], "ON") == 0);
  }
  
  publishStatus();
  updateLCD();
}

void applySafetyOff() {
  // Matikan aktuator jika SEMUA parameter sudah masuk batas aman minimum
  if (curTemp < OFF_THRESHOLD_TEMP && 
      curHum < OFF_THRESHOLD_HUMIDITY && 
      curCO2 < OFF_THRESHOLD_CO2) {
    
    // Gunakan helper agar tidak menekan tombol servo berulang-ulang
    bool wasChanged = false;
    if (fanState) { setFan(false); wasChanged = true; }
    if (dehumState) { setDehumidifier(false); wasChanged = true; }

    if (wasChanged) {
      Serial.println("[SAFETY] Environment safe. Actuators OFF.");
      publishStatus();
    }
  }
}

void setFan(bool on) {
  fanState = on;
  digitalWrite(FAN_RELAY_PIN, on ? LOW : HIGH); // LOW = ON
  Serial.printf("[ACTUATOR] Fan set to %s\n", on ? "ON" : "OFF");
}

void setDehumidifier(bool on) {
  // Jika target status sama dengan status saat ini, jangan lakukan apa-apa
  if (dehumState == on) return;

  // Gerakkan servo untuk menekan tombol fisik (Toggle Action)
  Serial.println("[SERVO] Toggling Dehumidifier switch...");
  dehumServo.write(90); 
  delay(1200); 
  dehumServo.write(0); 
  delay(500);

  dehumState = on; // Simpan status terbaru
  Serial.printf("[ACTUATOR] Dehumidifier status updated to %s\n", on ? "ON" : "OFF");
}

void updateLCD() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("--- MONITORING ---");
  lcd.setCursor(0,1); lcd.print("T:"); lcd.print(curTemp,1); lcd.print("C H:"); lcd.print(curHum,1); lcd.print("%");
  lcd.setCursor(0,2); lcd.print("CO2:"); lcd.print((int)curCO2); lcd.print(" ppm");
  lcd.setCursor(0,3); 
  lcd.print("F:"); lcd.print(fanState ? "ON " : "OFF");
  lcd.print(" D:"); lcd.print(dehumState ? "ON " : "OFF");
  lcd.setCursor(14,3); lcd.print(currentMode == AUTO_MODE ? "[AUTO]" : "[MANU]");
}

void publishData() {
  StaticJsonDocument<256> doc;
  doc["temperature"] = round(curTemp * 100.0) / 100.0;
  doc["humidity"]    = round(curHum * 100.0) / 100.0;
  doc["co2"]         = (int)curCO2;
  doc["fan"]         = fanState ? "ON" : "OFF";
  doc["dehumidifier"] = dehumState ? "ON" : "OFF";
  doc["mode"]        = (currentMode == AUTO_MODE) ? "AUTO" : "MANUAL";
  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topicSensor, buf);
}

void publishStatus() {
  StaticJsonDocument<256> doc;
  doc["status"] = "online";
  doc["fan"] = fanState ? "ON" : "OFF";
  doc["dehumidifier"] = dehumState ? "ON" : "OFF";
  doc["mode"] = (currentMode == AUTO_MODE) ? "AUTO" : "MANUAL";
  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(topicStatus, buf, true);
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  digitalWrite(STATUS_LED_PIN, HIGH);
}

void connectMQTT() {
  String clientId = "aura-esp-" + String(DEVICE_ID).substring(0, 4);
  if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    mqtt.subscribe(topicCommand);
    publishStatus();
  }
}

void calibrateMQ135() {
  float sum_v = 0;
  for(int i = 0; i < 50; i++) {
    sum_v += analogRead(MQ135_PIN) * (3.3 / 4095.0);
    delay(100);
  }
  float v_air = sum_v / 50.0;
  float rs_air = ((3.3 * R_LOAD) / v_air) - R_LOAD;
  Ro = rs_air / pow((ATMO_CO2 / CO2_A), (1 / CO2_B));
}