# Dokumentasi Sistem Pengumpulan Data Kalibrasi

## MPU6050 Calibration Firmware — XIAO ESP32-S3

> **Tujuan dokumen ini:** Menjelaskan secara menyeluruh alur kerja firmware kalibrasi, mulai dari inisialisasi sensor hingga data tersimpan di Supabase, termasuk desain keputusan teknis dan relevansinya terhadap analisis laporan tugas akhir.

---

## 1. Konteks Sistem

### 1.1 Tujuan Kalibrasi

Sistem keamanan pintu gudang menggunakan **algoritma deteksi intrusi berbasis threshold** (bukan Machine Learning). Algoritma produksi bekerja sebagai berikut:

```
Jika Δg ≥ TH_HIT DAN (now - lastHitTs) ≥ MIN_INTERHIT_MS:
    catat waktu hit
    hitung hit dalam WINDOW_SIZE_MS terakhir
    jika hit_count ≥ WINDOW_THRESHOLD:
        → ALARM INTRUSI
```

Parameter produksi saat ini:
| Parameter | Nilai | Keterangan |
|---|---|---|
| `TH_HIT` | 0.85g | Threshold per-hit (perlu dikalibrasi ulang) |
| `WINDOW_SIZE_MS` | 45.000ms | Jendela evaluasi 45 detik |
| `WINDOW_THRESHOLD` | 3 | Minimum hit dalam window untuk alarm |
| `MIN_INTERHIT_MS` | 300ms | Debounce antar hit |

**Data kalibrasi digunakan untuk membuktikan dan menentukan** nilai `TH_HIT` yang tepat — cukup tinggi agar derau lingkungan tidak memicu alarm palsu, tapi cukup rendah agar upaya intrusi nyata terdeteksi.

### 1.2 Hardware

| Komponen       | Detail                                                       |
| -------------- | ------------------------------------------------------------ |
| Mikrokontroler | Seeed XIAO ESP32-S3                                          |
| Sensor getar   | MPU6050 (I²C, SDA=D4/pin5, SCL=D5/pin6)                      |
| Sensor pintu   | Reed switch (D3/pin4, INPUT_PULLUP, LOW = tertutup)          |
| Pemasangan     | Casing PLA+ dengan insert nut, dipasang pada pintu ayun kayu |

### 1.3 Konfigurasi MPU6050

```cpp
Range akselerometer : ±8g
Range giroskop      : ±250°/s
DLPF bandwidth      : 44Hz  // dipilih: cukup untuk menangkap transien impact
                             // tanpa terlalu banyak noise frekuensi tinggi
```

**Mengapa 44Hz?** Di bawah 21Hz (konfigurasi lama) terlalu banyak energi impact terpotong. Di atas 94Hz terlalu banyak noise masuk. 44Hz adalah sweet spot untuk pintu kayu.

### 1.4 Konektivitas

```
Sensor → Supabase REST API (HTTPS POST) : data volume tinggi (calibration_raw, calibration_summary)
Sensor → MQTT over TLS (EMQX Cloud)     : volume rendah (heartbeat, status, perintah)
Web UI → MQTT                           : perintah kontrol (SET_SESSION, START, STOP, dll.)
```

---

## 2. Konsep Inti: Delta-g (Δg)

Semua pengukuran menggunakan **magnitude akselerasi** yang independen terhadap orientasi sensor:

```
a_mag = √(ax² + ay² + az²)   [dalam satuan g]
Δg    = |a_mag - baselineMag|
```

- **`baselineMag`**: magnitude akselerasi rata-rata saat sensor diam (diukur oleh `autoCalibrate()`)
- **`Δg`**: deviasi dari kondisi diam — nilai 0 = tidak ada getaran, nilai besar = ada benturan/getaran kuat
- **Orientasi tidak berpengaruh** — magnitude vektor sama dari sudut manapun sensor dipasang

### Mengapa tidak menggunakan sumbu tunggal?

Pintu yang dibentur dari berbagai sudut akan menghasilkan komponen akselerasi yang berbeda di tiap sumbu. Magnitude menggabungkan ketiganya sehingga pengukuran konsisten.

---

## 3. Sesi Kalibrasi

Terdapat 4 sesi percobaan yang masing-masing dirancang untuk mengukur profil getaran berbeda:

| Sesi  | Nama    | Tujuan                                                                                        | Data yang dihasilkan                    |
| ----- | ------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| **A** | Ambient | Mengukur derau lingkungan saat kondisi normal — derau ini **harus berada di bawah threshold** | `calibration_summary` (agregat 5 detik) |
| **B** | Impact  | Mengukur benturan tunggal (1 pukulan, 1 senggolan) — harus **melewati threshold hanya 1x**    | `calibration_raw` (per sampel 10ms)     |
| **C** | Chisel  | Mengukur pemahatan berulang (simulasi intrusi nyata) — harus **melewati threshold ≥3x**       | `calibration_raw`                       |
| **D** | Ram     | Mengukur pendobrakan berulang (simulasi intrusi kasar) — harus **melewati threshold ≥3x**     | `calibration_raw`                       |

**Logika penentuan threshold:**

```
TH_HIT > max(Δg_Session_A)        → tidak ada alarm dari derau lingkungan
TH_HIT ≈ mean(peak_Δg_Session_B)  → benturan tunggal melewati threshold hanya 1x (tidak alarm)
TH_HIT << min(peak_Δg_Session_C)  → pemahatan melewati threshold ≥3x (alarm)
```

---

## 4. Sistem Kalibrasi Baseline Otomatis

### 4.1 Masalah yang Dipecahkan

MPU6050 memiliki offset pabrik ±60mg/sumbu. Nilai `a_mag` saat diam bukan tepat 1.0g, melainkan bisa 1.02–1.06g. Setelah benturan fisik, sensor bisa sedikit bergeser dari posisi awal, mengubah offset tersebut. Jika firmware selalu menghitung `Δg = |a_mag - 1.0f|`, maka nilai ambient akan **drift** setelah benturan (gejala: Session A menunjukkan 0.05g, setelah Session B naik menjadi 0.14g).

### 4.2 Solusi: `autoCalibrate()`

```cpp
static float baselineMag = 1.0f;  // global, di-update oleh autoCalibrate()

static void autoCalibrate(int nSamples, const char* label) {
    float sum = 0.0f;
    for (int i = 0; i < nSamples; i++) {
        sum += readAccelMag();
        delay(10);
    }
    baselineMag = sum / nSamples;
    // log + MQTT event
}
```

`autoCalibrate()` dipanggil di **3 titik**:

| Konteks                         | Sampel | Durasi  | Alasan                                                   |
| ------------------------------- | ------ | ------- | -------------------------------------------------------- |
| Boot (`setup()`)                | 200    | 2 detik | Establishes baseline sebelum WiFi/MQTT terhubung         |
| Pre-record (`beginRecording()`) | 100    | 1 detik | Fresh baseline sebelum setiap trial baru                 |
| Manual RECAL (MQTT command)     | 300    | 3 detik | Kalibrasi ulang eksplisit, 3s untuk akurasi lebih tinggi |

**Tidak ada periodic re-calibration saat recording** — ini disengaja. Re-calibrate saat Session A berjalan akan menjadikan derau ambient sebagai "nol baru", yang bertentangan dengan tujuan pengukuran.

---

## 5. Alur Program: Boot hingga Recording

### 5.1 `setup()` — Inisialisasi

```
1. Serial.begin(115200)
2. Setup pin: SIREN (LOW), DOOR_SWITCH (INPUT_PULLUP), SIM800L (disable)
3. Wire.begin(SDA, SCL) → mpu.begin()
4. mpu.setAccelerometerRange(MPU6050_RANGE_8_G)
5. mpu.setFilterBandwidth(MPU6050_BAND_44_HZ)
6. autoCalibrate(200, "boot")   ← baseline pertama!
7. Baca state awal door (reed switch)
8. wifiConnect() → ntpSync()
9. MQTT: setServer, setCallback, setBufferSize(512)
10. Init semua timer: nextImuTick, lastFlushMs, lastHeartbeatMs, lastSummaryMs, summaryStartMs
```

**Penting:** `autoCalibrate()` berjalan **sebelum WiFi** — `publishEvent("BASELINE_CALIBRATED")` di dalamnya akan gagal kirim MQTT (koneksi belum ada), tapi log serial tetap tampil dan `baselineMag` tetap tersimpan. Tidak ada masalah.

### 5.2 `loop()` — Main Loop (berjalan terus menerus)

```
loop:
  1. WiFi reconnect jika terputus
  2. mqtt.loop()        ← memproses pesan MQTT masuk
  3. doorUpdate()       ← cek reed switch, trigger pause/resume
  4. [Countdown check]  ← jika countdown aktif, skip IMU sampling
  5. IMU sampling @ 100Hz (jika CAL_RECORDING)
  6. Publish summary setiap 5s (Session A)
  7. Flush buffer setiap 500ms (Session B/C/D)
  8. processRetryQueue()
  9. publishHeartbeat() setiap 15s
```

---

## 6. State Machine

```
         SET_SESSION + START
              │
    ┌─────────▼──────────┐
    │      CAL_IDLE       │◄──── STOP dari state manapun
    └─────────┬───────────┘
              │ beginRecording()
    ┌─────────▼──────────┐
    │   CAL_RECORDING     │◄──── auto-resume (Session A, 5s setelah pintu tutup)
    └─────────┬───────────┘
              │ Door dibuka / PAUSE
    ┌─────────▼──────────┐
    │    CAL_PAUSED       │
    └────────────────────┘
```

### 6.1 `startRecording()` — Guard & Dispatch

Sebelum memulai recording, dilakukan 3 validasi:

1. `currentSession` harus sudah di-set via `SET_SESSION`
2. Pintu harus tertutup (`doorClosed == true`)
3. Supabase harus reachable (HTTP GET ke `/rest/v1/`)

Jika lolos: Session B/C/D → mulai countdown 3 detik. Session A → langsung `beginRecording()`.

### 6.2 `beginRecording()` — Mulai Recording

```cpp
autoCalibrate(100, "pre-record");  // baseline segar
calState = CAL_RECORDING;
// reset semua akumulator, timer, buffer
nextImuTick = millis();  // PENTING: reset agar tidak burst sampling
```

### 6.3 `pauseRecording(reason)` — Saat Pintu Dibuka

- **Session A**: `purgeSummaryBuffer()` → buang 20 detik data terakhir (lihat §8)
- **Session B/C/D**: `flushRawBuffer()` → kirim data yang ada, lalu pause

### 6.4 `stopRecording()` — Normal Stop

- **Session A**: `publishSummary()` (masukkan akumulator ke buffer) → `flushAllSummaries()` (publish semua buffer tanpa buang)
- **Session B/C/D**: `flushRawBuffer()` → kirim sisa data, auto-increment `currentTrial`

---

## 7. IMU Sampling Loop

```cpp
// Dipanggil di loop() @ 100Hz (setiap 10ms)
if (calState == CAL_RECORDING && (int32_t)(millis() - nextImuTick) >= 0) {
    nextImuTick += IMU_SAMPLE_MS;  // 10ms
    float dg = readDeltaG();

    if (Session A) → akumulasi ke sumDg, sumMin, sumMax, sumCount
    else           → masukkan ke rawBuffer[], flush jika penuh
                     → cek silence detection
}
```

**`nextImuTick` direset di `beginRecording()`** untuk mencegah burst sampling di awal recording (sebelumnya menyebabkan window pertama memiliki 1300+ sampel alih-alih 500).

---

## 8. Session A: Summary Buffer + Door-Open Purge

### 8.1 Masalah yang Dipecahkan

Saat pintu akan dibuka, orang pasti menyentuh gagang pintu → ada getaran dari rotasi gagang. Getaran ini **bukan bagian dari derau lingkungan** yang ingin diukur. Jika langsung dipublish ke Supabase, data 5–20 detik sebelum pintu dibuka akan terkontaminasi.

### 8.2 Mekanisme Delayed Publish

```
Setiap 5 detik: publishSummary() dipanggil
    → Akumulator TIDAK langsung dikirim ke Supabase
    → Disimpan di summaryBuf[] (ring buffer, kapasitas 5 slot = 25 detik)
    → publishOldSummaries(): entry yang usia ≥ 20 detik baru dikirim ke Supabase

Timeline:
t=0s   Summary #1 masuk buffer
t=5s   Summary #2 masuk buffer
t=10s  Summary #3 masuk buffer
t=15s  Summary #4 masuk buffer
t=20s  Summary #5 masuk buffer → Summary #1 (usia 20s) DIKIRIM ke Supabase
t=25s  Summary #6 masuk buffer → Summary #2 DIKIRIM
...

Jika pintu dibuka di t=17s:
    → purgeSummaryBuffer() dipanggil
    → Summary #1, #2, #3 + akumulator → DIBUANG semua
    → Tidak ada data kontaminasi yang masuk ke Supabase
```

### 8.3 Efek yang Terlihat di UI

- Data muncul **setiap 5 detik** di tabel Summary(A) — ini normal
- Data yang muncul adalah **data 20 detik yang lalu** — ini disengaja (lag = purge window)
- Saat pintu dibuka: **tidak ada data baru muncul** selama beberapa saat → normal

### 8.4 Kapasitas Buffer

`SUMMARY_BUF_CAP = 5` slot × 5 detik = 25 detik kapasitas. Dengan purge window 20 detik, tersisa 5 detik margin. Jika buffer penuh (tidak mungkin dalam kondisi normal tanpa HTTP failure), entry tertua di-force publish.

---

## 9. Session B/C/D: Raw Buffer & Auto-Stop

### 9.1 Raw Buffer

```cpp
struct RawSample { uint32_t ts; float deltaG; };
static RawSample rawBuffer[55];  // kapasitas 55 sampel × 10ms = 550ms
```

Data di-flush ke Supabase setiap **500ms** atau ketika buffer penuh (55 sampel). Setiap baris di `calibration_raw` merepresentasikan **satu pembacaan sensor** — ini adalah data granular paling detail untuk analisis.

### 9.2 Auto-Stop (Silence Detection)

Untuk Session B/C/D, recording otomatis berhenti setelah 5 detik tidak ada aktivitas signifikan:

```cpp
SILENCE_THRESHOLD = 0.02f   // Δg minimum untuk dianggap "ada aktivitas"
SILENCE_TIMEOUT_MS = 5000   // 5 detik tanpa aktivitas → auto stop
```

Nilai 0.02f dipilih karena dengan baseline yang dikalibrasi dengan benar, ambient noise floor ~0.001–0.002g. Threshold 0.02g memberikan margin 10× di atas noise floor.

---

## 10. MQTT Command Protocol

Perintah dikirim sebagai JSON ke topic:

```
warehouses/{WAREHOUSE_ID}/areas/{AREA_ID}/devices/{DEVICE_ID}/commands
```

### Daftar Perintah

| Command       | Parameter                                           | Fungsi                                   |
| ------------- | --------------------------------------------------- | ---------------------------------------- |
| `SET_SESSION` | `session` (A/B/C/D), `trial` (int), `note` (string) | Set sesi aktif & nomor trial             |
| `START`       | —                                                   | Mulai recording (jalankan validasi dulu) |
| `STOP`        | —                                                   | Hentikan recording, flush data           |
| `MARK`        | `label` (string)                                    | Sisipkan marker di data raw              |
| `RECAL`       | —                                                   | `autoCalibrate(300, "RECAL")`            |

### Status/Heartbeat

Dikirim ke topic `.../{DEVICE_ID}/status` setiap 15 detik, berisi:

```json
{
  "device_id": "...",
  "cal_state": "RECORDING|PAUSED|IDLE",
  "session": "A|B|C|D|none",
  "trial": 1,
  "door": "CLOSED|OPEN",
  "uptime_sec": 3600,
  "wifi_rssi": -55,
  "free_heap": 180000,
  "ts": "2026-04-08T10:00:00Z"
}
```

### Event yang Dipublish

`SESSION_CONFIGURED`, `COUNTDOWN_STARTED`, `RECORDING_STARTED`, `RECORDING_PAUSED`, `RECORDING_STOPPED`, `AUTO_STOPPED_SILENCE`, `DOOR_OPENED`, `DOOR_CLOSED`, `DATA_PURGED`, `BASELINE_CALIBRATED`, `RECALIBRATED`, `ERROR_NO_SESSION`, `ERROR_DOOR_OPEN`, `ERROR_NO_CONNECTIVITY`

---

## 11. Struktur Database Supabase

### 11.1 `calibration_raw` — Data Mentah Session B/C/D

| Kolom       | Tipe   | Keterangan                     |
| ----------- | ------ | ------------------------------ |
| `session`   | char   | 'B', 'C', atau 'D'             |
| `trial`     | int    | Nomor percobaan                |
| `ts_device` | bigint | `millis()` saat sampel diambil |
| `ts_iso`    | text   | ISO timestamp dari NTP         |
| `delta_g`   | float  | Nilai Δg sampel ini            |
| `device_id` | uuid   | ID sensor                      |
| `note`      | text   | Catatan percobaan (opsional)   |
| `marker`    | text   | Label marker (jika ada)        |

**Frekuensi:** ~100 baris/detik per trial aktif, di-flush setiap 500ms.

### 11.2 `calibration_summary` — Agregat Session A

| Kolom          | Tipe  | Keterangan                        |
| -------------- | ----- | --------------------------------- |
| `session`      | char  | 'A'                               |
| `trial`        | int   | Nomor percobaan                   |
| `summary_type` | text  | 'periodic'                        |
| `dg_min`       | float | Δg minimum dalam window 5 detik   |
| `dg_max`       | float | Δg maksimum dalam window 5 detik  |
| `dg_mean`      | float | Δg rata-rata dalam window 5 detik |
| `n_samples`    | int   | Jumlah sampel dalam window        |
| `window_ms`    | int   | Durasi window aktual (ms)         |
| `device_id`    | uuid  | ID sensor                         |

**Frekuensi:** 1 baris per 5 detik, tapi dipublish dengan lag 20 detik (purge window). Baris hilang jika pintu dibuka.

### 11.3 `calibration_device_status` — Status Heartbeat

Satu baris per heartbeat (15 detik), berisi snapshot status sensor: recording state, door state, WiFi RSSI, free heap, uptime.

### 11.4 Views Turunan

| View                        | Fungsi                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `calibration_session_stats` | Statistik per sesi (min/max/mean/stddev/median/p95/p99) — Session A menggunakan `calibration_summary`, B/C/D menggunakan `calibration_raw` |
| `calibration_trial_peaks`   | Nilai Δg peak per trial                                                                                                                    |
| `calibration_peak_summary`  | Statistik dari nilai-nilai peak per sesi                                                                                                   |
| `calibration_statistics`    | Statistik overall per sesi                                                                                                                 |

---

## 12. Perilaku yang Diketahui (Known Behaviors)

### 12.1 Fluktuasi `n_samples` di Session A

Data yang diamati: `n_samples` berganti-ganti antara ~450 dan ~550 per window (bukan konsisten 500). Pola: pasangan berurutan selalu berjumlah ~1000.

**Penyebab:** `publishOldSummaries()` melakukan HTTP POST yang bersifat blocking (~600–700ms). Selama POST berlangsung, loop IMU tidak berjalan. Setelah POST selesai, `nextImuTick` tertinggal sehingga terjadi burst kecil (~50 sampel ekstra) di window berikutnya.

**Dampak:** Nilai Δg tidak terpengaruh. Hanya metadata `n_samples` dan `window_ms` yang tidak konsisten. **Tidak mempengaruhi validitas data untuk analisis threshold.**

### 12.2 `window_ms` ~4300ms alih-alih 5000ms

**Penyebab:** Sama — saat HTTP POST blocking berlangsung, waktu tersebut tidak dihitung sebagai durasi window karena IMU tidak sampling.

**Dampak:** `window_ms` merepresentasikan durasi sampling aktual (bukan wall clock). Untuk analisis, gunakan `n_samples × IMU_SAMPLE_MS` sebagai estimasi durasi nyata.

### 12.3 Lag 20 Detik di Summary(A)

Data yang muncul di tabel `calibration_summary` adalah data **20 detik yang lalu** — ini disengaja (purge buffer mechanism). Data real-time tidak bisa langsung dilihat; ada jeda 20 detik.

### 12.4 Boot `autoCalibrate` Event Hilang

`publishEvent("BASELINE_CALIBRATED")` di `autoCalibrate()` berjalan sebelum WiFi/MQTT terkoneksi. Event MQTT tidak terkirim tapi baseline tersimpan dengan benar. Log serial menampilkan nilai baseline.

---

## 13. Retry Queue & Fault Tolerance

Jika POST ke Supabase gagal (WiFi putus sementara, timeout):

- Payload yang gagal masuk ke `retryQueue[]` (kapasitas 5 item)
- Retry dilakukan setiap 2 detik, maksimal 3 kali percobaan per item
- Jika queue penuh: item terlama dibuang untuk memberi ruang bagi item baru
- Jika semua retry gagal: data hilang (acceptable untuk prototype ini)

---

## 14. Implikasi untuk Analisis Tugas Akhir

### 14.1 Data yang Perlu Dikumpulkan

**Minimum untuk analisis threshold:**

1. **Session A** ≥ 10 menit ambient tanpa interupsi → ambil `dg_max` tertinggi sebagai batas bawah `TH_HIT`
2. **Session B** ≥ 8 jenis benturan tunggal × minimal 3 repetisi → ambil `peak_Δg` per trial
3. **Session C & D** ≥ 5 jenis per sesi × minimal 3 repetisi → ambil `peak_Δg` dan frekuensi hit

**Pilihan threshold yang baik:**

```
TH_HIT ∈ (max_A, min_peak_B)

Contoh:
  max_A      = 0.009g  → ambient tertinggi
  min_peak_B = 0.35g   → benturan tunggal terlemah
  ∴ TH_HIT bisa dipilih 0.05–0.15g (jauh dari kedua batas)
```

### 14.2 Variabel yang Relevan untuk Laporan

| Variabel              | Dari mana                   | Untuk apa                             |
| --------------------- | --------------------------- | ------------------------------------- |
| `dg_max` Session A    | `calibration_session_stats` | Batas atas noise floor                |
| `peak_Δg` Session B   | `calibration_trial_peaks`   | Distribusi kekuatan benturan tunggal  |
| `peak_Δg` Session C/D | `calibration_trial_peaks`   | Distribusi kekuatan intrusi           |
| `dg_mean` Session A   | `calibration_session_stats` | Noise floor rata-rata                 |
| `dg_p95` Session A    | `calibration_session_stats` | 95% ambient berada di bawah nilai ini |

### 14.3 Justifikasi Parameter Algoritma

Tabel ini membantu menulis justifikasi di bab metodologi:

| Parameter               | Nilai  | Justifikasi                                                                               |
| ----------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `IMU_SAMPLE_MS = 10ms`  | 100 Hz | Frekuensi Nyquist untuk menangkap transien impact (~20–50Hz)                              |
| `DLPF = 44Hz`           | —      | Mempertahankan komponen impuls, menfilter noise >44Hz                                     |
| `RANGE = ±8g`           | —      | Benturan keras bisa >2g; ±8g memberikan headroom cukup                                    |
| `SUMMARY_INTERVAL = 5s` | —      | Window cukup panjang untuk statistik stabil, cukup pendek untuk deteksi perubahan ambient |
| `SILENCE_TIMEOUT = 5s`  | —      | Cukup lama untuk memastikan impact sudah selesai sebelum stop                             |
| `DOOR_PURGE = 20s`      | —      | Estimasi konservatif durasi kontak tangan-gagang sebelum pintu terbuka penuh              |

### 14.4 Skenario Pengujian yang Disarankan

```
Session A: Rekam 15-30 menit, kondisi:
  - Siang hari (aktivitas normal gudang)
  - Pintu tertutup rapat
  - Tidak ada orang di dekat pintu

Session B: Per trial (1 trial = 1 jenis benturan):
  - 1. Pukulan tangan tengah pintu
  - 2. Pukulan tangan tepi pintu
  - 3. Senggolan bahu (orang lewat)
  - 4. Tendangan ringan
  - 5. Dorong troli 1x
  - 6. Pukulan keras 1x
  - 7. Ketukan jari 1x
  - 8. Hentakan kaki ke lantai (bukan pintu)
  → Minimal 3x repetisi per jenis → bandingkan konsistensi

Session C (Chisel - pemahatan):
  - Gunakan obeng untuk "menc撬" area engsel/kunci
  - Rekam gerakan berulang

Session D (Ram - pendobrakan):
  - Hantaman bahu berulang
  - Tendangan berulang
  - Dorong keras berulang
```

---

## 15. Struktur File Relevan

```
backend/
├── device-simulator/
│   └── calibration_firmware/
│       └── calibration_firmware.ino     ← FIRMWARE UTAMA
├── src/
│   └── features/
│       └── calibration/
│           ├── controllers/             ← 9 REST API endpoints
│           ├── services/
│           │   ├── calibrationService.ts          ← query Supabase views
│           │   └── calibrationActuationService.ts ← publish MQTT commands
│           └── routes/
├── migrations/
│   └── create_calibration_tables.sql    ← Definisi tabel & views
└── KALIBRASI_SISTEM_DOKUMENTASI.md      ← DOKUMEN INI

frontend/
├── features/calibration/
│   ├── api/calibration.ts               ← TypeScript types & API calls
│   └── components/
│       ├── CalibrationControlPanel.tsx  ← UI kirim perintah
│       ├── CalibrationStatusDisplay.tsx ← panel status real-time
│       └── CalibrationDataTable.tsx     ← 6 tab tabel data
└── PANDUAN_HALAMAN_KALIBRASI.md         ← Panduan pengguna halaman kalibrasi
```

---

## 16. Kredensial & Konfigurasi

| Item         | Nilai                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------- |
| Device UUID  | `8e819e4a-9710-491f-9fbc-741892ae6195`                                                          |
| Warehouse ID | `eec544fc-bacb-4568-bc46-594ed5b5616f`                                                          |
| Area ID      | `4eb04ea1-865c-4043-a982-634ed59f6c7e`                                                          |
| Supabase URL | `https://yjgguuekranauuvxjbkh.supabase.co`                                                      |
| MQTT Broker  | `mfe19520.ala.asia-southeast1.emqxsl.com:8883`                                                  |
| WiFi SSID    | `HUAWEI-3X5S`                                                                                   |
| Database URL | `postgresql://postgres.yjgguuekranauuvxjbkh@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` |

---

## 17. Changelog Firmware

| Versi               | Perubahan                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| v2.0 awal           | Firmware dasar: sessions A/B/C/D, countdown, door monitoring, retry queue, heartbeat                                              |
| + Baseline fix      | `readDeltaG()` menggunakan `baselineMag` (bukan hardcoded 1.0f); tambah `readAccelMag()`, `autoCalibrate()`, global `baselineMag` |
| + DLPF 44Hz         | `MPU6050_BAND_21_HZ` → `MPU6050_BAND_44_HZ` untuk menangkap lebih banyak energi impact                                            |
| + SILENCE_THRESHOLD | 0.05f → 0.02f (noise floor turun dengan baseline yang benar)                                                                      |
| + Door purge        | Summary buffer 5 slot + `purgeSummaryBuffer()` + delayed publish 20 detik                                                         |
| + nextImuTick reset | `nextImuTick = millis()` di `beginRecording()` — mencegah burst sampling di awal                                                  |

---

_Dokumentasi ini dibuat berdasarkan kode sumber `calibration_firmware.ino` dan sistem backend/frontend — April 2026_
