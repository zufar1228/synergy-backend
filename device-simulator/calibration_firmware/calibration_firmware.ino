// ==============================================================
// GANTI DENGAN DATA DARI BLYNK DASHBOARD ANDA
#define BLYNK_TEMPLATE_ID "TMPL6yg2iv5Zd"
#define BLYNK_TEMPLATE_NAME "automatic lamp switch"
#define BLYNK_AUTH_TOKEN "XFHyYC6BicrGCmFMSP3-VGUV9pkTKerx"
// ==============================================================

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <Wire.h>
#include <Adafruit_ADS1X15.h>

// Kredensial WiFi Anda
char ssid[] = "HUAWEI-3X5S";
char pass[] = "Gr6TCfJ4";

Adafruit_ADS1115 ads;
BlynkTimer timer;

// Definisi Pin ESP32
#define RELAY_PIN 14
#define SDA_PIN 21
#define SCL_PIN 22

// Parameter Sensor BST (Contoh untuk Ru 1.0%)
const float BATAS_BAWAH_GELAP = 10.50; // mV
const float BATAS_ATAS_GELAP  = 25.88; // mV

// Variabel Kontrol Aplikasi
bool modeManual = false;  // false = Auto (Sensor), true = Manual (App)
bool statusRelay = LOW;

// --- Fungsi Menerima Perintah dari Tombol Blynk V2 (Mode Auto/Manual) ---
BLYNK_WRITE(V2) {
  modeManual = param.asInt(); // 1 jika Manual, 0 jika Auto
  if (modeManual) {
    Serial.println("MODE: MANUAL (Kontrol dari HP)");
  } else {
    Serial.println("MODE: OTOMATIS (Mengikuti Sensor BST)");
  }
}

// --- Fungsi Menerima Perintah dari Tombol Blynk V3 (Saklar Manual) ---
BLYNK_WRITE(V3) {
  if (modeManual) {
    statusRelay = param.asInt();
    digitalWrite(RELAY_PIN, statusRelay);
    
    // Update status V1 di Blynk
    if(statusRelay) Blynk.virtualWrite(V1, "NYALA (Manual)");
    else Blynk.virtualWrite(V1, "MATI (Manual)");
    
    Serial.print("Saklar Manual: ");
    Serial.println(statusRelay ? "NYALA" : "MATI");
  }
}

// --- Fungsi Rutin Membaca Sensor (Dipanggil setiap 1 detik oleh Timer) ---
void bacaSensor() {
  int16_t adc0 = ads.readADC_SingleEnded(0);
  float tegangan_V = ads.computeVolts(adc0);
  float tegangan_mV = tegangan_V * 1000.0;

  // Kirim nilai mV ke Blynk (Pin V0)
  Blynk.virtualWrite(V0, tegangan_mV);

  Serial.print("Tegangan BST: ");
  Serial.print(tegangan_mV, 2);
  Serial.println(" mV");

  // Jika Mode Auto aktif, jalankan logika Hysteresis sensor
  if (!modeManual) {
    if (tegangan_mV < BATAS_GELAP) {
      statusRelay = HIGH; // Gelap -> Lampu Nyala
      digitalWrite(RELAY_PIN, statusRelay);
      Blynk.virtualWrite(V1, "NYALA (Otomatis)");
      Blynk.virtualWrite(V3, 1);
    } 
    else if (tegangan_mV > BATAS_TERANG) {
      statusRelay = LOW; // Terang -> Lampu Mati
      digitalWrite(RELAY_PIN, statusRelay);
      Blynk.virtualWrite(V1, "MATI (Otomatis)");
      Blynk.virtualWrite(V3, 0);
    }
    // Jika nilai antara 10.0 hingga 25.0, status lampu tidak berubah (Zona Aman)
  }
}

void setup() {
  Serial.begin(115200);
  Serial.println("\nMenghubungkan ke WiFi dan Blynk...");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  Wire.begin(SDA_PIN, SCL_PIN);
  if (!ads.begin(0x48, &Wire)) {
    Serial.println("ERROR: ADS1115 Tidak Terdeteksi!");
    while (1);
  }
  ads.setGain(GAIN_SIXTEEN); // Super Sensitif

  Blynk.begin(BLYNK_AUTH_TOKEN, ssid, pass);

  // Atur timer untuk menjalankan fungsi bacaSensor() setiap 1000 milidetik (1 detik)
  timer.setInterval(1000L, bacaSensor);
  
  Serial.println("Sistem IoT Siap!");
}

void loop() {
  // Hanya dua perintah ini yang boleh ada di loop()
  Blynk.run();
  timer.run();
}