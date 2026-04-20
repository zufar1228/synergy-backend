# Analisis Codebase Fitur Pengambilan Data Kalibrasi

> **Dokumen ini** merupakan hasil analisis menyeluruh terhadap codebase fitur kalibrasi MPU6050, mencakup backend (Express), frontend (Next.js), firmware (ESP32-S3), skema database, serta solusi optimasi realtime yang telah diimplementasikan.

---

## 1. Arsitektur Umum

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CALIBRATION DATA COLLECTION SYSTEM                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     MQTT (TLS)     ┌──────────────────┐                 │
│   │   Frontend    │ ──── REST ──────→ │     Backend       │                 │
│   │   (Next.js)   │ ←── SSE ──────── │ (Express/Drizzle) │                 │
│   └──────────────┘                    └────────┬─────────┘                 │
│         ▲                                      │                           │
│         │ SSE / Polling                   MQTT Pub/Sub                     │
│         │                                      │                           │
│   ┌─────┴──────────┐                   ┌──────▼──────────┐                │
│   │   Supabase DB   │ ←── HTTP POST ── │   Firmware       │                │
│   │  (PostgreSQL)   │                   │  (ESP32-S3)      │                │
│   └────────────────┘                    └─────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Alur Data Utama

| Alur              | Sumber                               | Tujuan          | Protokol    | Keterangan                                                             |
| ----------------- | ------------------------------------ | --------------- | ----------- | ---------------------------------------------------------------------- |
| **Perintah**      | Frontend → Backend → Firmware        | Uni-directional | REST + MQTT | `SET_SESSION`, `START`, `STOP`, `MARK`, `RECAL`                        |
| **Sensor data**   | Firmware → Supabase                  | Direct write    | HTTPS REST  | `calibration_raw`, `calibration_summary`                               |
| **Device status** | Firmware → Supabase                  | Direct write    | HTTPS REST  | `calibration_device_status` (heartbeat tiap 15s + on state transition) |
| **Status read**   | Frontend → Backend → DB              | Query           | REST        | `GET /api-cal/status/:deviceId`                                        |
| **Realtime sync** | Firmware → MQTT → Backend → Frontend | Relay           | MQTT + SSE  | State transitions `cal_state` diteruskan via Server-Sent Events        |

### Prinsip Desain

- **No auth** pada route `/api-cal` — tool prototype internal, bukan production endpoint
- **Firmware menulis langsung ke Supabase** via HTTP POST (bukan lewat backend MQTT) — menghindari bottleneck MQTT untuk data volume tinggi
- **MQTT hanya untuk kontrol** — perintah dari frontend ke device, plus heartbeat/telemetri ringan
- **SSE untuk realtime** — menggantikan polling 1-5 detik, latensi <500ms

---

## 2. Struktur File

### 2.1 Backend (`src/features/calibration/`)

| File                                      | Fungsi                  | Detail                                                                                                                                                    |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `controllers/calibrationController.ts`    | 10 endpoint handlers    | `getStatus`, `sendCommand`, `getData`, `getSessions`, `getSummary`, `getStatistics`, `getSessionStats`, `getTrialPeaks`, `getPeakSummary`, `streamEvents` |
| `services/calibrationService.ts`          | Database queries        | Raw SQL via Drizzle, query ke semua tabel & views kalibrasi                                                                                               |
| `services/calibrationActuationService.ts` | MQTT command publisher  | Publish JSON command ke topic device                                                                                                                      |
| `services/calibrationEventBus.ts`         | SSE event bus (**NEW**) | In-memory registry of SSE clients per deviceId, keepalive 15s                                                                                             |
| `routes/calibrationRoutes.ts`             | Route definitions       | 11 routes di-mount pada `/api-cal`                                                                                                                        |

### 2.2 Backend — File Pendukung

| File                                       | Fungsi                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/mqtt/client.ts`                       | Koneksi MQTT broker (EMQX Cloud TLS), routing pesan, deteksi `cal_state` untuk SSE relay |
| `migrations/create_calibration_tables.sql` | DDL: 3 tabel + 4 views + RLS + indexes                                                   |

### 2.3 Frontend (`features/calibration/`)

| File                                      | Fungsi                        | Detail                                                                   |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `api/calibration.ts`                      | API client + TypeScript types | 9 endpoint wrappers, strong typing                                       |
| `components/CalibrationControlPanel.tsx`  | UI kontrol utama              | Trial presets, quickStart, audio cues, phase indicator                   |
| `components/CalibrationStatusDisplay.tsx` | Status device                 | Grid metrik real-time (cal_state, door, WiFi, heap)                      |
| `components/CalibrationDataTable.tsx`     | Tabel data                    | 6 tab view (session stats, summary, per-trial, peaks, peak summary, raw) |
| `hooks/useCalibrationSSE.ts`              | SSE hook (**NEW**)            | EventSource + auto-reconnect + fallback polling 3s                       |
| `index.ts`                                | Barrel exports                | Re-export komponen, hooks, dan API functions                             |

### 2.4 Halaman & Routing

| File                       | Fungsi                                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| `app/calibration/page.tsx` | Halaman kalibrasi utama, orchestrates SSE hook + 3 child components         |
| `middleware.ts`            | Auth middleware (Supabase session update, tidak ada check khusus kalibrasi) |

### 2.5 Firmware

| File                                                             | Fungsi                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `device-simulator/calibration_firmware/calibration_firmware.ino` | Firmware lengkap dengan state machine, sensor reading, data publishing |

---

## 3. State Machine Firmware

```
                  ┌───────────────────────────┐
                  │         CAL_IDLE           │
                  │  (menunggu perintah START)  │
                  └──────────┬────────────────┘
                             │ START command
                             │ (Session B/C)
                  ┌──────────▼────────────────┐
                  │       CAL_COUNTDOWN        │
                  │  (3 detik hitung mundur)    │
                  └──────────┬────────────────┘
                             │ 3s elapsed
                  ┌──────────▼────────────────┐
                  │      CAL_CALIBRATING       │
                  │  (autoCalibrate 100 sample) │
                  │  (~1 detik baseline)        │
                  └──────────┬────────────────┘
                             │ baseline selesai
                  ┌──────────▼────────────────┐
                  │      CAL_RECORDING         │
                  │  ⚡ Saat ini mulai simulasi │
                  │  (user HARUS menunggu ini)  │
                  └───┬──────────────────┬────┘
                      │ door open        │ STOP / auto-stop
           ┌──────────▼──────┐    ┌──────▼──────────────┐
           │   CAL_PAUSED    │    │      CAL_IDLE        │
           │  (pintu terbuka) │    │  (trial selesai,     │
           └──────────┬──────┘    │   auto-increment)    │
                      │ door close └─────────────────────┘
                      │ + 5s delay (Session A only)
                      │
                      ▼
               [Resume Recording]
```

### Session Types

| Session           | Tujuan                      | Metode Data     | Sampling           | Fitur Khusus                                            |
| ----------------- | --------------------------- | --------------- | ------------------ | ------------------------------------------------------- |
| **A** (Ambient)   | Baseline derau lingkungan   | Summary 5 detik | 100 Hz → aggregasi | Door-open purge 20s, auto-resume setelah pintu tutup 5s |
| **B** (Ramming)   | Profil benturan tunggal     | Raw per-sample  | 100 Hz langsung    | Auto-stop setelah 5s silence, flush tiap 500ms          |
| **C** (Chiseling) | Pola pembobolan obeng/pahat | Raw per-sample  | 100 Hz langsung    | Auto-stop setelah 5s silence                            |

### Trial Presets (UI)

| Session | Jumlah Trial | Contoh Note                                                              |
| ------- | ------------ | ------------------------------------------------------------------------ |
| A       | 1 (baseline) | "Full ambient baseline recording"                                        |
| B       | 7            | "Pukulan tengah", "Senggolan bahu", "Tendangan kuat", "Tendangan ringan" |
| C       | 7            | "Sela kusen kanan", "Sela bawah pintu", "Kusen atas"                     |

---

## 4. Skema Database

### 4.1 Tabel

#### `calibration_raw`

Data mentah per-sample untuk Session B/C (~100 sampel/detik).

| Kolom        | Tipe          | Keterangan                               |
| ------------ | ------------- | ---------------------------------------- |
| `id`         | BIGSERIAL PK  | Auto-increment                           |
| `session`    | TEXT          | "A", "B", "C", "D"                       |
| `trial`      | INTEGER       | Nomor trial (auto-increment per session) |
| `ts_device`  | BIGINT        | millis() timestamp device                |
| `ts_iso`     | TIMESTAMPTZ   | NTP-synced ISO timestamp                 |
| `delta_g`    | NUMERIC(10,6) | Deviasi dari baseline (g-units)          |
| `marker`     | TEXT          | Label marker opsional                    |
| `note`       | TEXT          | Catatan trial                            |
| `device_id`  | UUID          | ID perangkat                             |
| `created_at` | TIMESTAMPTZ   | Server timestamp                         |

#### `calibration_summary`

Agregasi 5 detik untuk Session A (ambient).

| Kolom          | Tipe          | Keterangan                 |
| -------------- | ------------- | -------------------------- |
| `id`           | BIGSERIAL PK  | Auto-increment             |
| `session`      | TEXT          | Selalu "A"                 |
| `trial`        | INTEGER       | Nomor trial                |
| `summary_type` | TEXT          | "periodic"                 |
| `dg_min`       | NUMERIC(10,6) | Minimum Δg dalam window    |
| `dg_max`       | NUMERIC(10,6) | Maximum Δg dalam window    |
| `dg_mean`      | NUMERIC(10,6) | Rata-rata Δg dalam window  |
| `n_samples`    | INTEGER       | Jumlah sampel dalam window |
| `window_ms`    | INTEGER       | Durasi window (ms)         |
| `device_id`    | UUID          | ID perangkat               |
| `created_at`   | TIMESTAMPTZ   | Server timestamp           |

#### `calibration_device_status`

Snapshot status device (heartbeat 15s + setiap transisi state).

| Kolom         | Tipe         | Keterangan                                                 |
| ------------- | ------------ | ---------------------------------------------------------- |
| `id`          | BIGSERIAL PK | Auto-increment                                             |
| `session`     | TEXT         | Session aktif                                              |
| `recording`   | BOOLEAN      | Apakah sedang recording                                    |
| `cal_state`   | TEXT         | State machine: IDLE/COUNTDOWN/CALIBRATING/RECORDING/PAUSED |
| `trial`       | INTEGER      | Trial aktif                                                |
| `uptime_sec`  | INTEGER      | Uptime device (detik)                                      |
| `wifi_rssi`   | INTEGER      | Kekuatan sinyal WiFi (dBm)                                 |
| `free_heap`   | INTEGER      | Free heap memory (bytes)                                   |
| `offline_buf` | INTEGER      | Jumlah sample dalam buffer                                 |
| `door_state`  | TEXT         | CLOSED/OPEN                                                |
| `device_id`   | UUID         | ID perangkat                                               |
| `created_at`  | TIMESTAMPTZ  | Server timestamp                                           |

### 4.2 Views (Database)

| View                        | Fungsi                                              | Sumber                                          |
| --------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `calibration_statistics`    | Statistik per-trial (min/max/mean/stddev/count)     | UNION `calibration_raw` + `calibration_summary` |
| `calibration_session_stats` | Agregat per-session + percentiles (p50/p90/p95/p99) | Agregasi dari `calibration_statistics`          |
| `calibration_trial_peaks`   | Max Δg per trial                                    | `calibration_raw` + `calibration_summary`       |
| `calibration_peak_summary`  | Statistik peak across trials per session            | Agregasi dari `calibration_trial_peaks`         |

### 4.3 Catatan

- Kolom `cal_state` **tidak ada dalam migration SQL** awal, ditambahkan via `ALTER TABLE` terpisah
- Backend `insertDeviceStatus()` tidak menyertakan `cal_state` (tapi firmware menulis langsung ke Supabase, bukan via backend)
- Backend menggunakan `SELECT *` sehingga `cal_state` tetap terbaca jika ada di tabel aktual

---

## 5. Backend API Endpoints

### Routes (`/api-cal`)

| Method | Path                | Handler           | Fungsi                                                   |
| ------ | ------------------- | ----------------- | -------------------------------------------------------- |
| GET    | `/events/:deviceId` | `streamEvents`    | **SSE stream** — realtime state via EventSource          |
| GET    | `/status/:deviceId` | `getStatus`       | Status device terbaru dari DB                            |
| POST   | `/command`          | `sendCommand`     | Kirim perintah via MQTT ke device                        |
| GET    | `/sessions`         | `getSessions`     | Daftar session                                           |
| GET    | `/data`             | `getData`         | Data mentah lintas session (query: trial, limit, offset) |
| GET    | `/data/:session`    | `getData`         | Data mentah per-session                                  |
| GET    | `/summary`          | `getSummary`      | Summary Session A (query: session, trial, limit, offset) |
| GET    | `/statistics`       | `getStatistics`   | Statistik per-trial                                      |
| GET    | `/session-stats`    | `getSessionStats` | Statistik per-session + percentiles                      |
| GET    | `/trial-peaks`      | `getTrialPeaks`   | Peak Δg per trial                                        |
| GET    | `/peak-summary`     | `getPeakSummary`  | Ringkasan peak across trials                             |

### MQTT Command Format

```json
{
  "cmd": "SET_SESSION",
  "session": "B",
  "trial": 1,
  "note": "Ketuk 1x pelan"
}
```

```json
{
  "cmd": "START"
}
```

### MQTT Topic Pattern

```
warehouses/{warehouse_id}/areas/{area_id}/devices/{device_id}/commands
warehouses/{warehouse_id}/areas/{area_id}/devices/{device_id}/status
```

---

## 6. Frontend: Komponen & Interaksi

### 6.1 Halaman Kalibrasi (`app/calibration/page.tsx`)

- **Device ID** default: `8e819e4a-9710-491f-9fbc-741892ae6195` (collapsible input)
- **SSE hook** di-lift ke page level: `useCalibrationSSE(deviceId)`
- **Badge koneksi**: `● Live` (hijau) jika SSE connected, `○ Polling` (abu) jika fallback
- **Layout**: Grid 2 kolom (ControlPanel + StatusDisplay) di atas, DataTable di bawah

### 6.2 CalibrationControlPanel

**State Management:**

- `activeSession` — Tab session A/B/C
- `loading` — String tracking tombol mana yang loading
- `completedTrials` — `Set<string>` untuk tracking progress UI
- `calState` — Diterima via prop dari SSE hook (sebelumnya: internal polling)

**Flow User:**

1. Pilih tab session (A/B/C) → muncul daftar trial preset
2. Klik trial → `quickStart()`: SET_SESSION + START
3. Phase indicator muncul: ⏳COUNTDOWN → 🔄KALIBRASI → 🟢MULAI!
4. Audio cues pada setiap transisi state
5. Klik STOP → device berhenti, trial auto-increment

**Audio Cues:**

- `RECORDING` → `playStart()` (ding)
- `COUNTDOWN` → `playBeep()`
- `PAUSED` → `playStop()`
- Error → `playError()`

### 6.3 CalibrationStatusDisplay

**Metrik yang ditampilkan:**

- `cal_state` (state machine device)
- `session`, `trial`, `door_state`
- WiFi RSSI, uptime, free heap, last seen

**Sumber data:**

- Prioritas: SSE status data (realtime)
- Fallback: HTTP polling 3 detik (jika SSE disconnected)

### 6.4 CalibrationDataTable

**6 Tab View:**

| Tab           | Data Source                      | Keterangan                               |
| ------------- | -------------------------------- | ---------------------------------------- |
| Session Stats | `calibration_session_stats` view | Agregat per-session + percentiles        |
| Summary (A)   | `calibration_summary` tabel      | Periodic 5-detik windows                 |
| Per-Trial     | `calibration_statistics` view    | Statistik per-trial, filter by session   |
| Trial Peaks   | `calibration_trial_peaks` view   | Max Δg per trial                         |
| Peak Summary  | `calibration_peak_summary` view  | Statistik peak across trials             |
| Raw Data      | `calibration_raw` tabel          | Individual readings, paginasi (limit 50) |

**Fitur:**

- Paginasi (limit 50, offset-based)
- Filter per session/trial
- Number formatting 4 desimal
- Baris marker ditandai kuning

### 6.5 TypeScript Types

```typescript
interface CalibrationDeviceStatus {
  id: number;
  session: string;
  recording: boolean;
  cal_state: string;
  trial: number;
  uptime_sec: number;
  wifi_rssi: number;
  free_heap: number;
  offline_buf: number;
  door_state: string;
  device_id: string;
  created_at: string;
}

interface CalibrationRaw {
  id: number;
  session: string;
  trial: number;
  ts_device: number;
  ts_iso: string;
  delta_g: number;
  marker?: string;
  note?: string;
  device_id: string;
  created_at: string;
}

interface CalibrationStatistic {
  session: string;
  trial: number;
  sample_count: number;
  dg_min: number;
  dg_max: number;
  dg_mean: number;
  dg_stddev: number;
  device_id: string;
}

interface CalibrationSessionStat {
  session: string;
  trial_count: number;
  total_samples: number;
  overall_min: number;
  overall_max: number;
  overall_mean: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}
```

---

## 7. Masalah yang Ditemukan & Solusi

### 7.1 Masalah: Lag Sinkronisasi State (Sebelum SSE)

**Gejala:**

- Status recording di UI tidak sinkron dengan kondisi nyata device
- User melakukan simulasi fisik terlalu awal (saat COUNTDOWN/CALIBRATING, bukan RECORDING)

**Bukti dari data:**

- Trial B/5: hanya 59 sampel, max Δg = 0.0053 (baseline murni — simulasi dilakukan saat belum RECORDING)
- Trial B/4: 80 sampel (tangkapan parsial)
- Seharusnya untuk 5 detik @ 100 Hz: ~500 sampel

**Root Cause:**
Setelah user klik START, firmware melewati sequence:

1. COUNTDOWN (3 detik)
2. CALIBRATING + autoCalibrate (100 sampel × 10ms = ~1 detik)
3. **RECORDING** — baru di sini simulasi fisik harus dimulai

Total: ~4-5 detik dari klik hingga RECORDING.

Dengan HTTP polling 1 detik + latency Supabase write (~500-1000ms), indikator "🟢 MULAI!" bisa muncul **1-3 detik terlambat**.

**Dampak:** User mulai mengetuk/mendorong pintu saat device masih COUNTDOWN/CALIBRATING → data yang terekam adalah baseline noise, bukan impact sebenarnya.

### 7.2 Solusi: Server-Sent Events (SSE) via MQTT Relay

**Perbandingan Latensi:**
| Metode | Path | Latensi Estimasi |
|--------|------|-----------------|
| Polling (lama) | Firmware → Supabase HTTP POST (~500-1000ms) → Backend DB query (polling 1s) → Frontend | **1.5-3 detik** |
| SSE (baru) | Firmware → MQTT (~100ms) → Backend SSE push → Frontend | **< 500ms** |

**Implementasi:**

1. **Backend Event Bus** (`calibrationEventBus.ts`):
   - `Map<deviceId, Set<SSEClient>>` — registry klien SSE per device
   - `subscribe(deviceId, res)` → mendaftarkan SSE client
   - `unsubscribe(deviceId, client)` → hapus saat disconnect
   - `emit(deviceId, data)` → broadcast ke semua subscriber device tersebut
   - Keepalive ping tiap 15 detik (`:keepalive\n\n`)

2. **SSE Endpoint** (`streamEvents`):
   - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
   - Saat connect: kirim status terbaru dari DB sebagai pesan SSE pertama
   - Subscribe ke event bus → terima relay MQTT
   - Saat `req.close`: auto-unsubscribe

3. **MQTT Handler** (modifikasi `client.ts`):
   - Deteksi field `cal_state` dalam pesan MQTT di status topic
   - Jika ada: panggil `calibrationEventBus.emit(deviceId, statusData)`
   - **Tidak** insert ke DB (firmware sudah menulis langsung ke Supabase)
   - Relay ini mencakup `publishHeartbeat()` (15s) dan `publishEvent()` (setiap transisi state)

4. **Frontend SSE Hook** (`useCalibrationSSE`):
   - Opens `EventSource` ke `/api-cal/events/${deviceId}`
   - `onopen`: set `connected = true`, stop fallback polling
   - `onmessage`: parse JSON, map ke `CalibrationDeviceStatus`, update state
   - `onerror`: set `connected = false`, aktifkan fallback polling 3 detik
   - Auto-reconnect: native EventSource behavior
   - Cleanup: close EventSource + clear interval on unmount

### 7.3 Keputusan Teknis

| Keputusan                       | Alasan                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SSE vs WebSocket                | Lebih sederhana, tidak perlu library baru, native EventSource auto-reconnect, unidirectional (cukup server→client) |
| MQTT relay vs Supabase Realtime | Lebih cepat (MQTT sudah diterima backend), tidak perlu dependency Supabase baru                                    |
| Polling fallback                | Graceful degradation — jika SSE gagal, kembali ke polling 3 detik                                                  |
| Tanpa perubahan firmware        | Firmware sudah publish `cal_state` + events via MQTT                                                               |
| Tanpa perubahan skema DB        | Tidak ada tabel/kolom baru yang diperlukan                                                                         |

---

## 8. Fitur Firmware yang Relevan

| #   | Fitur                | Keterangan                                                                               |
| --- | -------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Auto-increment trial | Session B/C: trial++ otomatis setelah STOP                                               |
| 3   | Auto-stop on silence | Δg < 0.02 selama 5 detik → auto-stop (Session B/C)                                       |
| 4   | Countdown 3 detik    | Delay sebelum RECORDING untuk persiapan                                                  |
| 12  | Retry queue          | POST gagal ke Supabase di-retry max 3x dengan delay 2 detik                              |
| 14  | Connectivity check   | Cek WiFi + Supabase sebelum START, tolak jika unreachable                                |
| —   | Door-open purge      | Session A: buang 20 detik data terakhir saat pintu dibuka (kontaminasi vibration handle) |
| —   | Baseline calibration | autoCalibrate() sebelum setiap session (100-200 sampel)                                  |

---

## 9. Konfigurasi & Konstanta Penting

### Firmware Timing

| Konstanta               | Nilai   | Fungsi                                    |
| ----------------------- | ------- | ----------------------------------------- |
| `IMU_SAMPLE_MS`         | 10ms    | Sampling rate 100 Hz                      |
| `SUMMARY_INTERVAL_MS`   | 5000ms  | Session A: summary tiap 5 detik           |
| `RAW_FLUSH_MS`          | 500ms   | Session B/C/D: flush buffer tiap 500ms    |
| `HEARTBEAT_INTERVAL_MS` | 15000ms | Heartbeat MQTT + Supabase tiap 15 detik   |
| `COUNTDOWN_MS`          | 3000ms  | Countdown sebelum recording               |
| `SILENCE_THRESHOLD`     | 0.02    | Δg di bawah ini = silence                 |
| `SILENCE_TIMEOUT_MS`    | 5000ms  | Durasi silence untuk auto-stop            |
| `DOOR_PURGE_WINDOW_MS`  | 20000ms | Durasi data yang di-purge saat pintu buka |
| `RAW_BUFFER_SIZE`       | 55      | Kapasitas buffer circular raw samples     |
| `RETRY_MAX_ATTEMPTS`    | 3       | Maksimum retry POST gagal                 |

### Device Identifiers

| Parameter      | Nilai                                  |
| -------------- | -------------------------------------- |
| `DEVICE_ID`    | `8e819e4a-9710-491f-9fbc-741892ae6195` |
| `WAREHOUSE_ID` | `eec544fc-bacb-4568-bc46-594ed5b5616f` |
| `AREA_ID`      | `4eb04ea1-865c-4043-a982-634ed59f6c7e` |

---

## 10. Ringkasan Per-Lapisan

### Backend

- **9 REST endpoints** + **1 SSE endpoint** di route `/api-cal`
- Database service menggunakan raw SQL via Drizzle (bukan ORM query builder)
- MQTT client meneruskan `cal_state` ke SSE event bus tanpa menyimpan ke DB
- Tidak ada authentication (prototype/internal tool)

### Frontend

- **3 komponen utama** + **1 custom hook** (SSE)
- State management via React hooks (useState, useRef, useEffect, useCallback)
- Tidak menggunakan Redux/Context (scope fitur terbatas)
- Audio feedback untuk State transitions
- UI responsif dengan trial presets touch-friendly (min-h 72px)
- Badge "● Live / ○ Polling" menunjukkan mode koneksi aktif

### Firmware

- State machine 5 state: IDLE → COUNTDOWN → CALIBRATING → RECORDING → PAUSED
- 3 jenis session (A/B/C) dengan mekanisme data berbeda
- Retry queue untuk POST gagal (max 3 percobaan)
- Door-open purge untuk Session A (buang 20 detik data kontaminasi)
- Auto-stop pada silence 5 detik (Session B/C)
- Connectivity check sebelum START

### Database

- **3 tabel**: `calibration_raw`, `calibration_summary`, `calibration_device_status`
- **4 views**: `calibration_statistics`, `calibration_session_stats`, `calibration_trial_peaks`, `calibration_peak_summary`
- Row Level Security (RLS) enabled
- Indexes pada kolom yang sering di-query (device_id, session, created_at)
