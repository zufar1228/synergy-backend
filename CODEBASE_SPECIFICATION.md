# Synergy IoT Backend — Spesifikasi Codebase Lengkap

> **Tujuan dokumen ini:** Memberikan pemahaman menyeluruh terhadap seluruh codebase backend sehingga programmer baru atau AI model yang baru membuka proyek ini dapat langsung memahami konteks, melacak alur kode, dan melakukan debugging tanpa harus menelusuri codebase berulang kali.

---

## Daftar Isi

1. [Ringkasan Proyek](#1-ringkasan-proyek)
2. [Stack Teknologi](#2-stack-teknologi)
3. [Struktur Direktori](#3-struktur-direktori)
4. [Environment Variables](#4-environment-variables)
5. [Startup & Lifecycle](#5-startup--lifecycle)
6. [Database Schema](#6-database-schema)
7. [Middleware & Authentication](#7-middleware--authentication)
8. [API Route Map Lengkap](#8-api-route-map-lengkap)
9. [MQTT Architecture](#9-mqtt-architecture)
10. [Fitur: Intrusi (Keamanan Pintu)](#10-fitur-intrusi-keamanan-pintu)
11. [Fitur: Lingkungan (Monitoring Lingkungan)](#11-fitur-lingkungan-monitoring-lingkungan)
12. [Fitur: Keamanan (Kamera)](#12-fitur-keamanan-kamera)
13. [Fitur: Kalibrasi MPU6050](#13-fitur-kalibrasi-mpu6050)
14. [Shared Services](#14-shared-services)
15. [Background Jobs](#15-background-jobs)
16. [Peta Dependensi Antar File](#16-peta-dependensi-antar-file)
17. [Pola & Konvensi Kode](#17-pola--konvensi-kode)
18. [NPM Scripts](#18-npm-scripts)
19. [Troubleshooting Guide](#19-troubleshooting-guide)

---

## 1. Ringkasan Proyek

Synergy IoT Backend adalah server Express.js/TypeScript yang mengelola ekosistem IoT untuk keamanan dan monitoring gudang. Sistem ini menghubungkan:

- **Perangkat IoT** (ESP32-S3) via MQTT over TLS
- **Database** (PostgreSQL via Supabase) via Drizzle ORM
- **Frontend** (Next.js) via REST API + SSE
- **Notifikasi** via Telegram Bot, Web Push, dan Email (Resend)
- **ML Server** (Python) untuk prediksi lingkungan

**3 Domain Utama:**
- **Intrusi** — Deteksi pembobolan pintu (MPU6050 vibration + reed switch)
- **Lingkungan** — Monitoring suhu/kelembapan/CO₂ (DHT22 + MQ135)
- **Keamanan** — Deteksi orang via kamera (ML object detection)

**1 Tool Domain:**
- **Kalibrasi** — Pengambilan data profil getaran untuk kalibrasi threshold intrusi

---

## 2. Stack Teknologi

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Runtime | Node.js | ≥18 |
| Framework | Express.js | 4.x |
| Language | TypeScript | 5.x |
| ORM | Drizzle ORM (+Drizzle Kit) | Latest |
| Database | PostgreSQL (Supabase) | 15+ |
| Legacy ORM | Sequelize (migration files only) | 6.x |
| MQTT | PubSubClient (mqtt.js) | EMQX Cloud TLS:8883 |
| Auth | Supabase Auth (JWT: ES256/RS256/HS256) | — |
| Email | Resend + React Email | — |
| Telegram | Bot API via axios | — |
| Web Push | web-push (VAPID) | — |
| Env Validation | Zod | — |
| Process Manager | PM2 (production) | — |
| Build | tsc → dist/ | — |
| Dev | tsx watch | — |

---

## 3. Struktur Direktori

```
backend/
├── package.json                    # Dependencies & scripts
├── tsconfig.json                   # TS config (ES2020, CommonJS, paths: @/*)
├── drizzle.config.ts               # Drizzle Kit → schema: src/db/schema.ts
├── pnpm-workspace.yaml             # pnpm config
├── oryx-build.sh                   # Azure build script (node dist/server.js)
│
├── config/                         # [LEGACY] Sequelize CLI config
│   ├── config.js
│   └── config.json
├── models/
│   └── index.js                    # [LEGACY] Sequelize model loader
├── migrations/                     # SQL + Sequelize migration files
│   ├── create_calibration_tables.sql
│   ├── create_intrusi_logs_table.sql
│   ├── create_lingkungan_tables.sql
│   ├── 20251210120000-create-user-roles.js
│   ├── 20260318084551-add_prediction_tracking.js
│   ├── 20260318085207-add_dehumidifier_column.js
│   └── 20260408_cleanup_calibration_schema.sql
├── seeders/                        # (kosong)
│
├── scripts/
│   ├── apply-indexes.ts            # Menerapkan 7 performance indexes
│   ├── check-cal-db.js             # Diagnostik DB kalibrasi
│   └── update-cal-views.js         # Update views kalibrasi
│
├── device-simulator/               # Firmware ESP32 + simulator testing
│   ├── calibration_firmware/       # Firmware kalibrasi MPU6050
│   ├── keamanan-simulator.ts       # Simulator kamera
│   ├── ml-processor-simulator.js   # Simulator ML server
│   └── telegram-notification-simulator.js
│
├── tests/                          # Test kalibrasi
│
└── src/                            # ══════ SOURCE UTAMA ══════
    ├── server.ts                   # Entry point
    │
    ├── config/
    │   ├── env.ts                  # Zod-validated environment variables
    │   └── supabaseAdmin.ts        # Supabase admin client (service role)
    │
    ├── db/
    │   ├── drizzle.ts              # pg Pool + Drizzle ORM instance
    │   ├── config.ts               # [LEGACY] Sequelize instance
    │   ├── schema.ts               # SEMUA definisi tabel Drizzle
    │   ├── models/                 # Re-export per-tabel dari schema
    │   │   ├── index.ts            # initDatabase() + barrel exports
    │   │   ├── area.ts
    │   │   ├── device.ts
    │   │   ├── incident.ts
    │   │   ├── profile.ts
    │   │   ├── pushSubscription.ts
    │   │   ├── telegramSubscriber.ts
    │   │   ├── userNotificationPreference.ts
    │   │   ├── userRole.ts
    │   │   └── warehouse.ts
    │   └── migrations/             # Drizzle-generated SQL migrations
    │
    ├── api/
    │   ├── middlewares/
    │   │   ├── authMiddleware.ts    # JWT verify + roleBasedAuth
    │   │   └── validateRequest.ts   # Zod validation middleware
    │   ├── controllers/             # 9 controller files
    │   └── routes/                  # 8 route files
    │
    ├── features/                   # 4 domain features
    │   ├── intrusi/
    │   ├── lingkungan/
    │   ├── keamanan/
    │   └── calibration/
    │
    ├── mqtt/
    │   └── client.ts               # MQTT client (570+ baris, KRITIS)
    │
    ├── services/                   # 12 shared service files
    ├── jobs/                       # Background cron jobs
    ├── emails/                     # React email templates
    ├── types/express/              # Express type augmentation
    └── utils/                      # Utility functions
```

---

## 4. Environment Variables

Divalidasi via Zod di `src/config/env.ts`. Aplikasi GAGAL start jika variabel required tidak ada.

### Required

| Variable | Tipe | Fungsi |
|----------|------|--------|
| `DATABASE_URL` | string | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | string | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | string | Supabase admin key (full access) |
| `MQTT_HOST` | string | EMQX Cloud broker hostname |
| `MQTT_USERNAME` | string | MQTT credentials |
| `MQTT_PASSWORD` | string | MQTT credentials |

### Optional (dengan default)

| Variable | Default | Fungsi |
|----------|---------|--------|
| `PORT` | `5001` | Port server |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Mode environment |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `LOG_LEVEL` | auto (debug di dev) | Level logging |
| `ML_SERVER_URL` | `http://localhost:5002` | URL ML prediction server |
| `TELEGRAM_CRITICAL_REMINDER_MS` | `1800000` (30 min) | Cooldown alert lingkungan |
| `TELEGRAM_RECOVERY_COOLDOWN_MS` | `120000` (2 min) | Cooldown recovery lingkungan |

### Optional (fitur disabled jika tidak ada)

| Variable | Fungsi |
|----------|--------|
| `EMQX_API_URL`, `EMQX_APP_ID`, `EMQX_APP_SECRET` | EMQX HTTP API provisioning |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GROUP_ID` | Telegram notifikasi |
| `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET` | Telegram webhook |
| `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push |
| `RESEND_API_KEY` | Email via Resend |

### Runtime (diakses langsung dari `process.env`)

| Variable | Fungsi |
|----------|--------|
| `SUPABASE_JWT_SECRET` | HS256 JWT verification di authMiddleware |

---

## 5. Startup & Lifecycle

### Urutan Startup (`src/server.ts`)

```
1. Create Express app
2. Configure: CORS, JSON parser, trust proxy, rate limiter
3. Mount routes:
   - GET /, GET /health, GET|HEAD /keep-alive   (health checks)
   - /api-cal/*                                  (kalibrasi, NO AUTH)
   - /api/devices, /api/warehouses, /api/areas   (CRUD, AUTH)
   - /api/analytics, /api/alerts, /api/navigation
   - /api/security-logs, /api/telegram
   - /api/users
   - /api/intrusi, /api/lingkungan               (domain features, AUTH)
4. Mount global error handler
5. app.listen(HOST:PORT)
6. Background init (setImmediate, non-blocking):
   a. Database connection check (15s timeout)
   b. MQTT client init
   c. Start 3 cron jobs:
      - Heartbeat checker (setiap 1 menit)
      - Repeat detection (setiap 1 menit)
      - Disarm reminder (setiap 10 menit)
   d. Telegram webhook setup (jika dikonfigurasi)
```

### Graceful Shutdown (SIGTERM/SIGINT)

```
1. Stop HTTP server (drain connections)
2. Stop semua cron jobs
3. Disconnect MQTT client
4. Drain database connection pool
5. process.exit(0) atau force exit setelah 10 detik
```

### Rate Limiting

| Scope | Limit | Window |
|-------|-------|--------|
| Global (production) | 1000 requests | 15 menit |
| Global (development) | 5000 requests | 15 menit |
| Telegram webhook | 60 requests | 1 menit |

---

## 6. Database Schema

### 6.1 Tabel Core (Drizzle ORM — `src/db/schema.ts`)

#### `warehouses`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK, default random) | |
| `name` | VARCHAR(255) NOT NULL | |
| `location` | TEXT | |
| `created_at` | TIMESTAMPTZ (default now) | |
| `updated_at` | TIMESTAMPTZ (default now) | |

#### `areas`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `warehouse_id` | UUID FK → warehouses | ON DELETE CASCADE |
| `name` | VARCHAR(255) NOT NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

#### `devices`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `area_id` | UUID FK → areas | ON DELETE CASCADE |
| `name` | VARCHAR(255) NOT NULL | |
| `system_type` | VARCHAR(50) NOT NULL | `'keamanan'`, `'intrusi'`, `'lingkungan'` |
| `status` | VARCHAR(50) default `'Offline'` | `'Online'`/`'Offline'` |
| `last_heartbeat` | TIMESTAMPTZ | Updated via MQTT |
| **Lingkungan fields:** | | |
| `fan_state` | VARCHAR(20) | `'ON'`/`'OFF'` |
| `dehumidifier_state` | VARCHAR(20) | `'ON'`/`'OFF'` |
| `control_mode` | VARCHAR(20) default `'AUTO'` | `'AUTO'`/`'MANUAL'` |
| `manual_override_until` | TIMESTAMPTZ | Expiry manual mode (5 min) |
| `last_temperature` | NUMERIC(5,2) | |
| `last_humidity` | NUMERIC(5,2) | |
| `last_co2` | NUMERIC(7,2) | |
| `last_prediction_temperature` | NUMERIC(5,2) | |
| `last_prediction_humidity` | NUMERIC(5,2) | |
| `last_prediction_co2` | NUMERIC(7,2) | |
| `actuator_fan_reason` | TEXT | Alasan fan state terakhir |
| `actuator_dehumidifier_reason` | TEXT | |
| **Intrusi fields:** | | |
| `door_state` | VARCHAR(20) | `'OPEN'`/`'CLOSED'` |
| `intrusi_system_state` | VARCHAR(20) | `'ARMED'`/`'DISARMED'` |
| `siren_state` | VARCHAR(20) | `'ON'`/`'OFF'` |
| `power_source` | VARCHAR(20) | `'MAINS'`/`'BATTERY'` |
| `vbat_voltage` | NUMERIC(4,2) | Volt baterai |
| `vbat_pct` | INTEGER | Persentase baterai |

#### `profiles`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | = Supabase auth user ID |
| `username` | VARCHAR(255) | |
| `security_timestamp` | BIGINT | Untuk invalidasi token |
| `telegram_user_id` | BIGINT | Linked Telegram account |

#### `user_roles`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `user_id` | UUID FK → profiles | ON DELETE CASCADE, UNIQUE |
| `role` | VARCHAR(50) default `'user'` | `'user'`, `'admin'`, `'super_admin'` |

#### `incidents`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `device_id` | UUID FK → devices | |
| `incident_type` | VARCHAR(100) | |
| `confidence` | NUMERIC(5,4) | ML confidence score |
| `raw_features` | JSON | ML features |
| `status` | VARCHAR(50) default `'unacknowledged'` | |
| `acknowledged_by` / `acknowledged_at` | | |
| `notes` | TEXT | |

#### `user_notification_preferences`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `user_id` | UUID FK → profiles | |
| `system_type` | VARCHAR(50) | `'keamanan'`/`'intrusi'`/`'lingkungan'` |
| `is_enabled` | BOOLEAN default true | |
| UNIQUE(`user_id`, `system_type`) | | |

#### `push_subscriptions`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `user_id` | UUID FK → profiles | |
| `endpoint` | TEXT NOT NULL (UNIQUE) | Web Push endpoint |
| `p256dh` | TEXT NOT NULL | |
| `auth` | TEXT NOT NULL | |

#### `telegram_subscribers`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `user_id` | BIGINT (PK) | Telegram user ID |
| `username` | VARCHAR(255) | |
| `first_name` | VARCHAR(255) | |
| `status` | VARCHAR(50) default `'member'` | `'member'`/`'left'`/`'kicked'` |
| `joined_at` / `left_at` / `kicked_at` | TIMESTAMPTZ | |

### 6.2 Tabel Log Fitur

#### `lingkungan_logs`
| Kolom | Tipe | Index |
|-------|------|-------|
| `id` | BIGSERIAL (PK) | |
| `device_id` | UUID FK → devices | `idx_lingkungan_logs_device_ts` |
| `timestamp` | TIMESTAMPTZ | `idx_lingkungan_logs_device_ts` |
| `temperature` | NUMERIC(5,2) | |
| `humidity` | NUMERIC(5,2) | |
| `co2` | NUMERIC(7,2) | |
| `status` | VARCHAR(50) default `'unacknowledged'` | |
| `acknowledged_by` / `acknowledged_at` / `notes` | | |
| `notification_sent_at` | TIMESTAMPTZ | |

#### `prediction_results`
| Kolom | Tipe | Index |
|-------|------|-------|
| `id` | BIGSERIAL (PK) | |
| `device_id` | UUID FK → devices | `idx_prediction_results_device_ts` |
| `timestamp` | TIMESTAMPTZ | `idx_prediction_results_device_ts` |
| `predicted_temperature` / `predicted_humidity` / `predicted_co2` | NUMERIC | |
| `prediction_horizon_min` | INTEGER (default 15) | |
| `fan_triggered` | BOOLEAN | |
| `dehumidifier_triggered` | BOOLEAN | |
| `alert_sent` | BOOLEAN | |

#### `intrusi_logs`
| Kolom | Tipe | Index |
|-------|------|-------|
| `id` | BIGSERIAL (PK) | |
| `device_id` | UUID FK → devices | `idx_intrusi_logs_device_ts`, `idx_intrusi_logs_device_event_ts` |
| `timestamp` | TIMESTAMPTZ | |
| `event_type` | VARCHAR(50) | See enum below |
| `system_state` | VARCHAR(20) | `'ARMED'`/`'DISARMED'` |
| `door_state` | VARCHAR(20) | `'OPEN'`/`'CLOSED'` |
| `peak_delta_g` | NUMERIC(10,6) | Kekuatan getaran |
| `hit_count` | INTEGER | Jumlah hit dalam window |
| `payload` | JSON | Raw MQTT payload |
| `status` | VARCHAR(50) default `'unacknowledged'` | |
| `acknowledged_by` / `acknowledged_at` / `notes` | | |
| `notification_sent_at` | TIMESTAMPTZ | |

**Event Types**: `ARMED`, `DISARM`, `DOOR_OPEN`, `DOOR_CLOSE`, `IMPACT_WARNING`, `UNAUTHORIZED_OPEN`, `FORCED_ENTRY_ALARM`, `SIREN_SILENCED`, `HEARTBEAT`

#### `keamanan_logs`
| Kolom | Tipe | Index |
|-------|------|-------|
| `id` | BIGSERIAL (PK) | |
| `device_id` | UUID FK → devices | `idx_keamanan_logs_device_created`, `idx_keamanan_logs_detected_status` |
| `created_at` | TIMESTAMPTZ | |
| `image_url` | TEXT | URL gambar deteksi |
| `detected` | BOOLEAN | Ada orang terdeteksi? |
| `box` | JSON | Bounding box koordinat |
| `confidence` | NUMERIC(5,4) | ML confidence |
| `attributes` | JSON | Atribut orang (warna baju, topi, dll) |
| `status` | VARCHAR(50) default `'unacknowledged'` | |
| `acknowledged_by` / `acknowledged_at` / `notes` | | |
| `notification_sent_at` | TIMESTAMPTZ | |

### 6.3 Tabel Kalibrasi (raw SQL, bukan di Drizzle schema)

| Tabel/View | Keterangan |
|------------|------------|
| `calibration_raw` | Data mentah getaran per-sample |
| `calibration_summary` | Summary 5 detik Session A |
| `calibration_device_status` | Snapshot status device |
| `calibration_statistics` (VIEW) | Statistik per-trial |
| `calibration_session_stats` (VIEW) | Statistik per-session + percentiles |
| `calibration_trial_peaks` (VIEW) | Peak Δg per trial |
| `calibration_peak_summary` (VIEW) | Ringkasan peak per session |

### 6.4 Relasi

```
warehouses  1→N  areas  1→N  devices  1→N  { incidents, keamanan_logs, intrusi_logs,
                                              lingkungan_logs, prediction_results }
profiles  1→1  user_roles
profiles  1→N  { user_notification_preferences, push_subscriptions }
```

---

## 7. Middleware & Authentication

### 7.1 `authMiddleware` (`src/api/middlewares/authMiddleware.ts`)

**Flow JWT Verification:**

```
1. Extract "Bearer <token>" dari header Authorization
2. Decode header token (tanpa verify) untuk ambil algorithm
3. IF alg = ES256 atau RS256 (asymmetric):
   a. Fetch JWKS dari {issuer}/.well-known/jwks.json
   b. Cache JWKS selama 1 jam
   c. Cari key berdasarkan kid
   d. Build public key via crypto.createPublicKey()
4. IF alg = HS256 (symmetric):
   a. Gunakan SUPABASE_JWT_SECRET
   b. Auto-detect Base64 encoding
5. jwt.verify(token, key, { algorithms: [alg] })
6. Extract: sub → user ID, app_metadata.role → role (default 'user')
7. Set req.user = { id, email, role }
```

**Error Responses:**
- `401` — Token missing, malformed, expired, atau invalid
- `500` — JWT secret tidak dikonfigurasi, JWKS fetch gagal

### 7.2 `roleBasedAuth(allowedRoles)` (sama file)

```ts
// Contoh penggunaan:
router.post('/command', authMiddleware, roleBasedAuth(['admin', 'super_admin']), handler)
```

- Cek `req.user.role` terhadap array `allowedRoles`
- Return `403` jika role tidak sesuai

### 7.3 `validate(schema)` (`src/api/middlewares/validateRequest.ts`)

- Validasi `req.body`, `req.query`, atau `req.params` menggunakan Zod schema
- Return `400` dengan detail error jika gagal

### 7.4 Rate Limiting

- Global: `express-rate-limit` dengan window 15 menit
- Telegram webhook: Window 1 menit, 60 request max

### 7.5 CORS

```ts
cors({
  origin: env.FRONTEND_URL,  // default: http://localhost:3000
  credentials: true
})
```

---

## 8. API Route Map Lengkap

### Health Check (tanpa auth)

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `{ status: 'ok', uptime, timestamp, environment }` |
| GET | `/health` | `{ status: 'ok', database: bool, mqtt: bool }` |
| GET/HEAD | `/keep-alive` | `204 No Content` |

### Kalibrasi — `/api-cal` (TANPA AUTH)

| Method | Path | Handler | Deskripsi |
|--------|------|---------|-----------|
| POST | `/command` | `sendCommand` | Kirim perintah ke device via MQTT |
| GET | `/events/:deviceId` | `streamEvents` | **SSE stream** realtime |
| GET | `/status/:deviceId` | `getStatus` | Status device terbaru |
| GET | `/sessions` | `getSessions` | Daftar session kalibrasi |
| GET | `/data` | `getData` | Data kalibrasi (raw) |
| GET | `/data/:session` | `getData` | Data per session |
| GET | `/summary` | `getSummary` | Summary Session A |
| GET | `/statistics` | `getStatistics` | Statistik per-trial |
| GET | `/session-stats` | `getSessionStats` | Statistik per-session |
| GET | `/trial-peaks` | `getTrialPeaks` | Peak per trial |
| GET | `/peak-summary` | `getPeakSummary` | Ringkasan peak |

### Devices — `/api/devices` (AUTH required)

| Method | Path | Auth Level | Handler | Deskripsi |
|--------|------|-----------|---------|-----------|
| GET | `/details` | user | `getDeviceDetailsByArea` | Query: `?area_id&system_type` |
| GET | `/` | user | `listDevices` | Semua device |
| POST | `/` | admin | `createDevice` | Create + EMQX provisioning |
| GET | `/:id` | user | `getDeviceById` | Detail 1 device |
| PUT | `/:id` | admin | `updateDevice` | Update device |
| DELETE | `/:id` | admin | `deleteDevice` | Delete + EMQX deprovision |

### Warehouses — `/api/warehouses` (AUTH required)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| GET | `/` | user | `listWarehouses` (with area/device stats) |
| GET | `/:id` | user | `getWarehouseById` |
| GET | `/:id/areas-with-systems` | user | `getAreasWithSystems` |
| POST | `/` | admin | `createWarehouse` |
| PUT | `/:id` | admin | `updateWarehouse` |
| DELETE | `/:id` | admin | `deleteWarehouse` |

### Areas — `/api/areas` (AUTH required)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| GET | `/?warehouse_id` | user | `listAreas` |
| POST | `/` | admin | `createArea` |
| PUT | `/:id` | admin | `updateArea` |
| DELETE | `/:id` | admin | `deleteArea` |

### Users — `/api/users` (Mixed auth)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| GET | `/` | super_admin | `listUsers` |
| POST | `/invite` | super_admin | `inviteUser` (Supabase generateLink) |
| DELETE | `/:id` | super_admin | `deleteUser` (+ Telegram kick) |
| PUT | `/:id/role` | super_admin | `updateUserRole` |
| PUT | `/:id/status` | super_admin | `updateUserStatus` |
| GET | `/me` | user | `getMyProfile` |
| PUT | `/me` | user | `updateMyProfile` |
| GET | `/verify-access` | user | `verifyAccess` |
| GET | `/me/preferences` | user | `getMyPreferences` |
| PUT | `/me/preferences` | user | `updateMyPreferences` |
| POST | `/sync-roles` | super_admin | `syncAllRoles` |
| GET | `/push/vapid-key` | user | `getVapidPublicKey` |
| POST | `/push/subscribe` | user | `subscribeToPush` |
| POST | `/push/test` | user | `testPushNotification` |

### Analytics — `/api/analytics` (AUTH required)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/:system_type` | `getAnalytics` — Query: `?area_id&from&to&status&event_type&system_state&door_state&page&per_page` |

### Alerts — `/api/alerts` (AUTH required)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/active?warehouse_id` | `listActiveAlerts` |

### Navigation — `/api/navigation` (AUTH required)

| Method | Path | Handler |
|--------|------|---------|
| GET | `/areas-by-system?system_type` | `listAreasBySystem` |

### Intrusi — `/api/intrusi` (AUTH required)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| GET | `/devices/:deviceId/logs` | user | `getLogs` |
| GET | `/devices/:deviceId/summary` | user | `getSummary` |
| GET | `/devices/:deviceId/status` | user | `getStatus` |
| POST | `/devices/:deviceId/command` | admin | `sendCommand` |
| PUT | `/logs/:id/status` | admin | `updateStatus` |

### Lingkungan — `/api/lingkungan` (AUTH required)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| GET | `/devices/:deviceId/logs` | user | `getLogs` |
| GET | `/devices/:deviceId/summary` | user | `getSummary` |
| GET | `/devices/:deviceId/status` | user | `getStatus` |
| GET | `/devices/:deviceId/chart` | user | `getChartData` |
| POST | `/devices/:deviceId/control` | admin | `sendControlCommand` |
| PUT | `/logs/:id/status` | admin | `updateStatus` |

### Keamanan — `/api/security-logs` (AUTH required)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| PUT | `/:id/status` | admin | `updateStatus` |
| POST | `/trigger-repeat-detection` | admin | `triggerRepeatDetection` |

### Telegram — `/api/telegram` (Mixed auth)

| Method | Path | Auth Level | Handler |
|--------|------|-----------|---------|
| POST | `/webhook` | public (secret token) | `handleWebhook` |
| POST | `/invite` | super_admin | `createInvite` |
| POST | `/kick` | super_admin | `kickSubscriber` |
| GET | `/members` | super_admin | `getSubscribers` |
| GET | `/webhook-info` | super_admin | `getWebhookInfo` |
| POST | `/setup-webhook` | super_admin | `setupWebhook` |
| POST | `/test-alert` | super_admin | `sendTestAlert` |

---

## 9. MQTT Architecture

### 9.1 Koneksi

| Parameter | Nilai |
|-----------|-------|
| Protocol | `mqtts://` (TLS) |
| Port | `8883` |
| Broker | EMQX Cloud Serverless |
| Client ID | `synergy-backend-{NODE_ENV}` |
| Clean Session | `true` (tidak ada queued replay) |
| QoS | 1 (with deduplication) |
| Keepalive | 120 detik |
| Reconnect | Interval 5 detik |
| Health Check | Setiap 60 detik |
| Force Recreate | Setelah 10 gagal reconnect |

### 9.2 Topic Pattern

**Subscribe:**
```
warehouses/+/areas/+/devices/+/sensors/#    (data sensor)
warehouses/+/areas/+/devices/+/status       (heartbeat/status)
```

**Publish:**
```
warehouses/{wid}/areas/{aid}/devices/{did}/commands   (perintah ke device)
backend/heartbeat                                      (backend keepalive)
```

### 9.3 Alur Pemrosesan Pesan (`src/mqtt/client.ts`)

```
Pesan masuk
  │
  ├─ Retained message? → SKIP (mencegah false Online)
  │
  ├─ Topic .../status (heartbeat)
  │   ├─ Parse JSON
  │   ├─ Extract device_id dari topic
  │   ├─ Intrusi fields: door_state, system_state, siren_state, power_source, vbat
  │   │   └─ processPowerAlert() jika ada perubahan power/battery
  │   ├─ Lingkungan fields: fan_state, dehumidifier_state, control_mode
  │   │   └─ Control mode dari ESP32 hanya diterima jika TIDAK ada manual override aktif
  │   ├─ Kalibrasi: jika ada field cal_state → calibrationEventBus.emit()
  │   └─ updateDeviceHeartbeat(device_id)
  │
  └─ Topic .../sensors/{systemType}
      ├─ QoS 1 dedup check (10 detik window)
      │
      ├─ systemType = "intrusi"
      │   ├─ Derive siren_state dari event_type
      │   ├─ Update device fields (door, state, siren, power, vbat)
      │   ├─ intrusiService.ingestIntrusiEvent()
      │   └─ processIntrusiAlert() untuk UNAUTHORIZED_OPEN / FORCED_ENTRY_ALARM
      │
      └─ systemType = "lingkungan"
          ├─ Update device readings (temp, humidity, co2)
          ├─ lingkunganService.ingestSensorData() → ML pipeline
          └─ updateDeviceHeartbeat()
```

### 9.4 Deduplication

- QoS 1 dapat mengirim pesan duplikat
- Backend menyimpan `Map<messageKey, timestamp>` selama 10 detik
- Key = `${topic}:${payloadHash}`
- Duplikat di-skip

---

## 10. Fitur: Intrusi (Keamanan Pintu)

### 10.1 File Map

```
src/features/intrusi/
├── index.ts                              # Barrel exports
├── controllers/intrusiController.ts      # 5 endpoint handlers
├── routes/intrusiRoutes.ts               # Route definitions
├── models/intrusiLog.ts                  # [LEGACY] Sequelize model
├── analytics/intrusiAnalytics.ts         # Analytics config
├── jobs/disarmReminderJob.ts             # Cron: DISARM reminder
└── services/
    ├── intrusiService.ts                 # CRUD + business logic
    ├── intrusiAlertingService.ts         # Alert pipeline
    └── actuationService.ts              # MQTT command sender
```

### 10.2 Service Functions

#### `intrusiService.ts`

| Fungsi | Operasi |
|--------|---------|
| `ingestIntrusiEvent(data)` | INSERT ke `intrusi_logs`, return row |
| `getIntrusiLogs({ device_id, limit, offset, from, to, event_type })` | Paginated SELECT dengan filter |
| `getIntrusiSummary(device_id, from, to)` | 4 count queries: total, alarm, impact, unacknowledged |
| `getIntrusiStatus(device_id)` | Status 3-tier: AMAN/WASPADA/BAHAYA |
| `updateIntrusiLogStatus(logId, userId, status, notes)` | Acknowledge log entry |

**Logika Status 3-Tier:**
- **BAHAYA**: Ada alarm (`FORCED_ENTRY_ALARM`/`UNAUTHORIZED_OPEN`) yang belum di-acknowledge DAN tidak ada clearing event (`DISARM`/`SIREN_SILENCED`) setelahnya
- **WASPADA**: ARMED + ada `IMPACT_WARNING` yang belum di-acknowledge
- **AMAN**: Semua kondisi lainnya

#### `intrusiAlertingService.ts`

| Fungsi | Operasi |
|--------|---------|
| `processIntrusiAlert(deviceId, data)` | Cooldown 5 menit → fetch context → `notifySubscribers('intrusi', ...)` |
| `processPowerAlert(deviceId, data)` | Deteksi perubahan power source + battery ≤10% → alert |

**Cooldown:**
- Intrusion alert: 5 menit per device
- Battery critical: 30 menit per device
- In-memory Map, pruned setiap 30 menit

#### `actuationService.ts`

| Fungsi | MQTT Command |
|--------|-------------|
| `sendIntrusiCommand(deviceId, command)` | Publish ke `.../commands` topic |

**Command Types:** `ARM`, `DISARM`, `SIREN_SILENCE`, `STATUS`

### 10.3 Analytics

```ts
// Filter yang didukung:
{ status, event_type, system_state, door_state, from, to, area_id }
// Comma-separated values untuk multi-select, e.g. event_type=ARMED,DISARM
```

### 10.4 Cron: Disarm Reminder

- Jalan setiap 10 menit
- Query device dengan `intrusi_system_state = 'DISARMED'`
- Jika DISARMED > 1 jam → kirim Telegram reminder

---

## 11. Fitur: Lingkungan (Monitoring Lingkungan)

### 11.1 File Map

```
src/features/lingkungan/
├── index.ts
├── controllers/lingkunganController.ts
├── routes/lingkunganRoutes.ts
├── models/lingkunganLog.ts              # [LEGACY]
├── models/predictionResult.ts           # [LEGACY]
├── analytics/lingkunganAnalytics.ts
└── services/
    ├── lingkunganService.ts             # ~790 baris, KOMPLEKS
    └── lingkunganAlertingService.ts     # Alert + cooldown
```

### 11.2 4-Level Actuator Control

```
┌───────────────────────────────────────────────────────────────────┐
│                    PRIORITAS KONTROL AKTUATOR                      │
├───────────────────────────────────────────────────────────────────┤
│ Level 1 — MANUAL OVERRIDE (highest priority)                      │
│   Trigger: User klik tombol fan/dehumidifier di dashboard         │
│   Durasi: 5 menit (MANUAL_OVERRIDE_DURATION_MS = 300000)         │
│   Efek: Bypass semua level lain selama override aktif             │
│                                                                    │
│ Level 2 — FIRMWARE SAFETY (medium priority)                       │
│   Trigger: SEMUA reading < safe threshold                         │
│   Thresholds: temp < 30°C DAN humidity < 75% DAN co2 < 1200 ppm  │
│   Efek: Matikan aktuator + kirim RECOVERY alert                  │
│                                                                    │
│ Level 3a — ML PREDICTIVE                                          │
│   Trigger: Prediksi ML melebihi threshold                         │
│   Thresholds: temp > 35°C ATAU humidity > 80% ATAU co2 > 1500ppm │
│   Efek: Nyalakan fan/dehumidifier + kirim PREDICTIVE alert       │
│                                                                    │
│ Level 3b — ACTUAL FAILSAFE (fallback)                             │
│   Trigger: Reading aktual melebihi failsafe threshold             │
│   Thresholds: temp > 34°C ATAU humidity > 79% ATAU co2 > 1450ppm │
│   Efek: Nyalakan aktuator + kirim FAILSAFE alert                 │
└───────────────────────────────────────────────────────────────────┘
```

### 11.3 ML Prediction Pipeline

```
1. ingestSensorData()
   │
   ├─ INSERT ke lingkungan_logs
   ├─ UPDATE device last_temperature/humidity/co2
   ├─ (non-blocking) triggerPrediction()
   │   │
   │   ├─ Mutex check: predictionInFlight Set
   │   ├─ Count logs ≥ 240 (1 jam data @ 15 detik interval)?
   │   │   └─ Jika kurang → skip
   │   ├─ Fetch 240 sample terakhir
   │   ├─ POST ke {ML_SERVER_URL}/predict
   │   │   Body: { device_id, readings: [{temperature, humidity, co2}], prediction_horizon: 15 }
   │   │   Timeout: 15 detik
   │   ├─ handlePredictionResult()
   │   │   ├─ INSERT ke prediction_results (forecasted_at = latest + 15min)
   │   │   └─ handlePredictiveControl()  → Level 3a
   │   └─ Release mutex
   │
   ├─ handleActualThresholdControl()    → Level 3b
   └─ handleFirmwareSafetyCheck()       → Level 2
```

### 11.4 Alert Cooldown (Lingkungan)

| Skenario | Behavior |
|----------|----------|
| Alert pertama untuk device | Kirim langsung, set `alertActive=true` |
| Alert ulang dalam `TELEGRAM_CRITICAL_REMINDER_MS` (30 min) | Suppress |
| Alert ulang setelah cooldown | Kirim sebagai reminder |
| Recovery saat `alertActive=false` | Suppress |
| Recovery dalam `TELEGRAM_RECOVERY_COOLDOWN_MS` (2 min) dari recovery terakhir | Suppress |
| Recovery lainnya | Kirim, reset `alertActive=false` |

### 11.5 Service Functions

| Fungsi | Deskripsi |
|--------|-----------|
| `ingestSensorData(data)` | Full pipeline: ingest → predict → control |
| `handleManualControl(deviceId, { fan?, dehumidifier? })` | Level 1 manual override |
| `switchToAutoMode(deviceId)` | Reset ke AUTO |
| `sendActuatorCommand(deviceId, { fan?, dehumidifier? })` | MQTT publish command |
| `getLingkunganLogs(...)` | Paginated query |
| `getLingkunganSummary(device_id)` | Multi-query summary |
| `getChartData(device_id)` | Actual vs predicted time-series |
| `getLingkunganStatus(device_id)` | Status 3-tier: NORMAL/WASPADA/BAHAYA |
| `updateLingkunganLogStatus(...)` | Acknowledge log |

**Status 3-Tier Lingkungan:**
- **BAHAYA**: Reading melebihi failsafe threshold
- **WASPADA**: Reading mendekati threshold (peringatan awal)
- **NORMAL**: Semua reading dalam batas aman

---

## 12. Fitur: Keamanan (Kamera)

### 12.1 File Map

```
src/features/keamanan/
├── index.ts
├── controllers/keamananController.ts
├── routes/keamananRoutes.ts
├── models/keamananLog.ts               # [LEGACY]
├── analytics/keamananAnalytics.ts
├── jobs/repeatDetectionJob.ts          # Cron: deteksi berulang
└── services/
    ├── keamananService.ts              # Hanya updateStatus
    └── repeatDetectionService.ts       # Deteksi orang berulang
```

### 12.2 Data Flow

Keamanan berbeda dari fitur lain — data TIDAK masuk via MQTT backend. Data keamanan ditulis langsung ke Supabase oleh ML processor (Python) yang memproses gambar kamera.

Backend hanya:
1. Membaca `keamanan_logs` untuk analytics/management
2. Update status (acknowledge)
3. Menjalankan repeat detection job

### 12.3 Repeat Detection Algorithm

```
Setiap 1 menit (cron job):
1. Query keamanan_logs: detected=true, notification_sent_at IS NULL, status='unacknowledged'
2. Group by {device_id}_{identity_key}
   - identity_key = atribut orang (warna baju, topi, dll) → string deterministik
3. Untuk setiap group:
   - Cek apakah sudah ada notifikasi dalam 15 detik terakhir
   - Jika ≥2 deteksi dalam 15 detik → kirim Telegram alert
   - Tandai semua log sebagai notified
```

### 12.4 Analytics

```ts
// Filter: { status, from, to, area_id }
// Summary: { total_detections, unacknowledged_alerts }
```

---

## 13. Fitur: Kalibrasi MPU6050

### 13.1 File Map

```
src/features/calibration/
├── index.ts
├── controllers/calibrationController.ts
├── routes/calibrationRoutes.ts
└── services/
    ├── calibrationService.ts            # DB queries (raw SQL via Drizzle)
    ├── calibrationActuationService.ts   # MQTT command publish
    └── calibrationEventBus.ts           # SSE event bus
```

### 13.2 SSE Event Bus

- In-memory `Map<deviceId, Set<SSEClient>>`
- `subscribe(deviceId, res)` — Register SSE client, mulai keepalive 15s
- `unsubscribe(deviceId, client)` — Hapus client saat disconnect
- `emit(deviceId, data)` — Broadcast ke semua subscriber device

### 13.3 SSE Endpoint Flow

```
Client connect ke GET /api-cal/events/:deviceId
  │
  ├─ Set header: Content-Type: text/event-stream
  ├─ Kirim status terbaru dari DB sebagai pesan pertama
  ├─ Subscribe ke event bus
  ├─ Terima MQTT relay setiap ada state change
  └─ Pada req.close: auto unsubscribe
```

### 13.4 MQTT → SSE Relay

Modifikasi di `src/mqtt/client.ts`:
- Deteksi field `cal_state` di pesan status MQTT
- Panggil `calibrationEventBus.emit(deviceId, statusData)`
- TIDAK insert ke DB (firmware sudah menulis langsung ke Supabase)

---

## 14. Shared Services

### 14.1 `alertingService.ts` — Notification Dispatcher

```ts
notifySubscribers(systemType, subject, emailProps)
```

**Flow:**
1. Query users dengan `notification_preferences` enabled untuk `systemType`
2. Telegram task (SELALU jalan):
   - Cek gatekeeper lingkungan (`shouldSendLingkunganTelegram()`)
   - Build HTML message
   - `telegramService.sendGroupAlert(message)`
3. Push task (hanya jika ada subscriber):
   - Build push payload (title, body)
   - `webPushService.sendPushNotification()` untuk setiap user

### 14.2 `telegramService.ts` — Telegram Bot API

| Fungsi | Bot API Method | Deskripsi |
|--------|----------------|-----------|
| `sendGroupAlert(msg)` | sendMessage | Kirim ke group (HTML, disable preview) |
| `createSingleUseInviteLink()` | createChatInviteLink | Link invitasi (10 min, 1 member) |
| `kickMember(userId)` | banChatMember + unbanChatMember | Kick (ban → unban 1.5s) |
| `setWebhook()` | setWebhook | Setup webhook URL |
| `getWebhookInfo()` | getWebhookInfo | Debug info |
| `deleteWebhook()` | deleteWebhook | Hapus webhook |

### 14.3 `webPushService.ts` — Web Push

| Fungsi | Operasi |
|--------|---------|
| `saveSubscription(userId, sub)` | UPSERT ke `push_subscriptions` |
| `sendPushNotification(userId, payload)` | Query subscriptions → `webpush.sendNotification()` |

Auto-cleanup: Hapus subscription stale (HTTP 410/404/401).

### 14.4 `deviceService.ts` — Device CRUD

| Fungsi | Operasi |
|--------|---------|
| `createDevice(data)` | INSERT + EMQX provisioning (user + ACL) |
| `deleteDevice(id)` | DELETE + EMQX deprovisioning |
| `updateDeviceHeartbeat(id)` | SET status='Online', last_heartbeat=now |
| Lainnya | Standard CRUD |

### 14.5 `emqxService.ts` — EMQX Cloud Provisioning

| Fungsi | EMQX API Call | Deskripsi |
|--------|---------------|-----------|
| `provisionDevice(deviceId)` | POST /authentication + POST /authorization | Create MQTT user + ACL rules |
| `deprovisionDevice(deviceId)` | DELETE /authorization + DELETE /authentication | Remove ACL + user |

**ACL Rules per Device:**
- Publish: `warehouses/{wid}/areas/{aid}/devices/{did}/#`
- Subscribe: `warehouses/{wid}/areas/{aid}/devices/{did}/commands`

### 14.6 `userService.ts` — User Management

| Fungsi | Operasi |
|--------|---------|
| `inviteUser(email, role)` | Supabase `generateLink('invite')` + insert role |
| `deleteUser(id)` | Supabase admin delete + Telegram kick |
| `syncAllRoles()` | Sync role ke Supabase `app_metadata` |
| `verifyAccess(userId)` | Cek `user_roles` → auto-delete jika tidak ada |

---

## 15. Background Jobs

| Job | Interval | File | Logika |
|-----|----------|------|--------|
| **Heartbeat Checker** | 1 menit | `src/jobs/heartbeatChecker.ts` | Query device dengan `last_heartbeat < 2 menit lalu` → SET `status='Offline'` |
| **Repeat Detection** | 1 menit | `src/features/keamanan/jobs/repeatDetectionJob.ts` | Cari deteksi kamera berulang dalam 15 detik → Telegram alert |
| **Disarm Reminder** | 10 menit | `src/features/intrusi/jobs/disarmReminderJob.ts` | Cari device DISARMED > 1 jam → Telegram reminder |

---

## 16. Peta Dependensi Antar File

```
server.ts (Entry Point)
  │
  ├── Routes → Controllers → Services → DB (Drizzle) + MQTT
  │
  ├── mqtt/client.ts (KRITIS — hub pemrosesan data IoT)
  │     ├── → intrusiService.ingestIntrusiEvent()
  │     ├── → lingkunganService.ingestSensorData()
  │     ├── → deviceService.updateDeviceHeartbeat()
  │     ├── → intrusiAlertingService.processPowerAlert()
  │     └── → calibrationEventBus.emit()
  │
  ├── Feature Services (business logic)
  │     ├── lingkunganService → ML_SERVER_URL/predict (HTTP POST)
  │     ├── lingkunganService → sendActuatorCommand (MQTT publish)
  │     ├── intrusi actuationService → MQTT publish /commands
  │     ├── calibration actuationService → MQTT publish /commands
  │     ├── *AlertingService → alertingService.notifySubscribers()
  │     └── alertingService → telegramService + webPushService
  │
  ├── All Services → db/drizzle.ts + db/schema.ts
  │
  └── External APIs:
        ├── Supabase Auth API (user management)
        ├── EMQX HTTP API (device provisioning)
        ├── Telegram Bot API (alerts, group management)
        ├── Web Push VAPID (browser notifications)
        ├── Resend Email API (invitations)
        └── ML Server HTTP (predictions)
```

---

## 17. Pola & Konvensi Kode

### Error Handling

```ts
// Custom error class — digunakan di semua services
throw new ApiError(statusCode, message)
// 400 = Bad Request, 401 = Unauthorized, 403 = Forbidden, 404 = Not Found

// Global error handler di server.ts menangkap ApiError → response JSON
```

### Database Query Pattern

```ts
// Semua query menggunakan Drizzle ORM
import { db } from '@/db/drizzle'
import { tableName } from '@/db/schema'

// Select
const result = await db.query.tableName.findMany({ where: and(...conditions) })

// Insert
const [inserted] = await db.insert(tableName).values(data).returning()

// Update
const [updated] = await db.update(tableName).set(data).where(eq(tableName.id, id)).returning()
```

### MQTT Publish Pattern

```ts
const topic = `warehouses/${wid}/areas/${aid}/devices/${did}/commands`
mqttClient.publish(topic, JSON.stringify(command), { qos: 1 })
```

### In-Memory State Pattern

```ts
// Digunakan di: intrusiAlertingService, lingkunganAlertingService, mqtt dedup
const stateMap = new Map<string, StateData>()

// Dengan auto-cleanup via setInterval (setiap 30 menit)
setInterval(() => {
  // Prune entries older than 1 hour
}, 30 * 60 * 1000)
```

### Alert Pipeline Pattern

```ts
// trigger → cooldown check → fetch context (device+area+warehouse) → notifySubscribers()
//   → telegramService.sendGroupAlert() + webPushService.sendPushNotification()
```

---

## 18. NPM Scripts

| Script | Command | Fungsi |
|--------|---------|--------|
| `dev` | `tsx watch src/server.ts` | Dev server + hot reload |
| `build` | `tsc` | Compile ke `dist/` |
| `start` | `node dist/server.js` | Production start |
| `db:generate` | `drizzle-kit generate` | Generate migration SQL |
| `db:migrate` | `drizzle-kit migrate` | Run migrations |
| `db:push` | `drizzle-kit push` | Push schema ke DB |
| `db:studio` | `drizzle-kit studio` | Drizzle Studio GUI |
| `simulator:keamanan` | `tsx device-simulator/keamanan-simulator.ts` | Jalankan simulator kamera |

---

## 19. Troubleshooting Guide

### Device tidak muncul Online

1. Cek MQTT connection di log startup (`[MQTT] Connected`)
2. Cek apakah device publish ke topic yang benar: `warehouses/{wid}/areas/{aid}/devices/{did}/status`
3. Cek heartbeat checker job berjalan (log setiap 1 menit)
4. Device dianggap Offline jika `last_heartbeat > 2 menit`

### Notifikasi Telegram tidak terkirim

1. Cek `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_GROUP_ID` di env
2. Cek webhook setup: `POST /api/telegram/setup-webhook`
3. Cek cooldown — alert mungkin di-suppress (5 menit intrusi, 30 menit lingkungan)
4. Cek `user_notification_preferences` — user harus enable untuk system_type terkait

### ML Prediction tidak jalan

1. Cek `ML_SERVER_URL` di env (default: `http://localhost:5002`)
2. Butuh minimum 240 data points (1 jam data)
3. Cek mutex: hanya 1 prediction per device bersamaan (`predictionInFlight` Set)
4. Timeout: 15 detik — jika ML server lambat, prediction di-skip

### SSE Kalibrasi tidak realtime

1. Cek SSE endpoint: `GET /api-cal/events/:deviceId`
2. Cek MQTT relay: field `cal_state` harus ada di pesan MQTT status
3. Cek keepalive: comment `:keepalive\n\n` tiap 15 detik (mencegah proxy timeout)
4. Jika di belakang nginx/proxy: pastikan `X-Accel-Buffering: no` header dikirim

### Database query lambat

1. Jalankan `scripts/apply-indexes.ts` untuk membuat indexes
2. Cek indexes: `idx_lingkungan_logs_device_ts`, `idx_intrusi_logs_device_ts`, `idx_keamanan_logs_device_created`
3. Kalibrasi menggunakan raw SQL (bukan Drizzle) — cek views di `create_calibration_tables.sql`
