# Dokumentasi Latency Sistem Intrusi End-to-End

Dokumen ini menjelaskan spesifikasi teknis dan metode pengujian latency sistem intrusi end-to-end untuk kebutuhan implementasi dan bahan laporan.

## 1. Tujuan

1. Mendefinisikan standar pengukuran latency end-to-end sistem intrusi.
2. Menjelaskan perubahan firmware dan backend yang diperlukan agar pengujian benar-benar dari perangkat (device-origin E2E).
3. Menyediakan metode uji yang repeatable, terukur, dan aman untuk lingkungan production.
4. Menyusun format keluaran hasil uji (CSV, JSON, Markdown) yang langsung bisa dipakai sebagai bukti laporan.

## 2. Ruang Lingkup

Mencakup:

1. Firmware intrusi (publish event/status + command test deterministik).
2. Pipeline backend (MQTT ingest, DB insert, keputusan alert, dispatch notifikasi, Telegram API ACK).
3. Harness otomatis pengujian latency.
4. Metodologi analisis statistik (p50/p95/p99 dan SLA verdict).

Tidak mencakup:

1. Pengujian performa frontend render.
2. Pengukuran latency jaringan internet pengguna akhir (outside Telegram API ACK).

## 3. Definisi End-to-End

Pengukuran E2E yang dipakai:

1. E2E Publish -> Telegram ACK
   - Dari timestamp publish event hingga ACK Telegram API diterima backend.
2. E2E Device -> Telegram ACK
   - Dari timestamp device saat event dibuat hingga ACK Telegram API diterima backend.

Rumus:

- Publish-to-ACK: T_e2e_publish = t5 - t0
- Device-to-ACK: T_e2e_device = t5 - t_device

Dengan titik waktu:

1. t0 = publish_ms (dari payload trace)
2. t_device = device_ms (clock perangkat saat event dibuat)
3. t1 = backend menerima pesan MQTT
4. t2 = setelah insert log/event selesai diproses backend
5. t3 = keputusan alert dibuat
6. t4 = dispatch notifikasi dimulai
7. t5 = ACK Telegram API diterima

## 4. Arsitektur Instrumentasi

## 4.1 Firmware (Device)

File utama firmware:

- device-simulator/firmware_door_security_v2.ino

Perubahan kunci:

1. Menambahkan metadata trace ke payload event/status:
   - trace_id
   - test_run_id
   - test_scenario
   - seq
   - test_bypass_cooldown
   - device_ms
   - publish_ms
2. Menambahkan command test via MQTT commands topic:
   - TEST_FORCED_ENTRY
   - TEST_UNAUTHORIZED_OPEN
   - TEST_BATTERY_CRITICAL
   - TEST_POWER_TO_BATTERY
   - TEST_POWER_TO_MAINS
3. Command parser membaca cmd + metadata test dari JSON command.
4. Menjaga backward compatibility command operasional:
   - ARM
   - DISARM
   - SIREN_SILENCE
   - STATUS

## 4.2 Backend

Perubahan backend utama:

1. src/features/intrusi/services/latencyTrackerService.ts
   - Menyimpan jejak stage latency per trace_id ke tabel intrusi_latency_trace.
2. src/mqtt/client.ts
   - Membaca metadata trace dari payload.
   - Mencatat t1 dan t2.
   - Meneruskan trace metadata ke service alert.
3. src/features/intrusi/services/intrusiAlertingService.ts
   - Mencatat t3.
   - Menambahkan bypass cooldown saat test_bypass_cooldown=true.
   - Meneruskan latencyTrace ke dispatcher notifikasi.
4. src/services/alertingService.ts
   - Mencatat t4 saat dispatch dimulai.
   - Mencatat t5 saat Telegram ACK.

## 4.3 Tabel Penyimpanan Latency

Tabel:

- intrusi_latency_trace

Kolom inti:

1. trace_id (PK)
2. run_id
3. scenario
4. device_id
5. event_type
6. t0_publish_ms
7. device_ms
8. t1_mqtt_rx_ms
9. t2_db_insert_ms
10. t3_alert_decision_ms
11. t4_notify_dispatch_ms
12. t5_telegram_api_ack_ms
13. cooldown_suppressed
14. telegram_sent
15. error
16. created_at
17. updated_at

## 5. Harness Otomatis

File harness:

- tests/latency/intrusi-latency-harness.ts

Script runner:

- pnpm test:latency:intrusi

Mode trigger:

1. device_command (default, disarankan)
   - Harness publish command TEST_* ke topic commands perangkat.
   - Device yang memicu event/status aktual.
2. direct_mqtt (fallback)
   - Harness publish langsung ke topic sensor/status.
   - Berguna untuk validasi pipeline backend ketika firmware/device belum siap.

Skenario yang didukung:

1. intrusi_alarm
2. battery_critical
3. power_to_battery
4. power_to_mains
5. mixed

Output laporan otomatis:

1. tests/latency/reports/<run-id>/latency_raw.csv
2. tests/latency/reports/<run-id>/summary.json
3. tests/latency/reports/<run-id>/summary.md

## 6. Prasyarat Pengujian

## 6.1 Konfigurasi Sistem

1. Backend berjalan dan terhubung database.
2. MQTT broker (EMQX) aktif dan kredensial valid.
3. Telegram bot token dan group id valid.
4. Device intrusi online dan subscribe topic commands.
5. Firmware intrusi sudah versi yang mendukung TEST_* command + trace fields.

## 6.2 Variabel Environment Minimum (Backend)

1. DATABASE_URL
2. MQTT_HOST
3. MQTT_USERNAME
4. MQTT_PASSWORD
5. TELEGRAM_BOT_TOKEN
6. TELEGRAM_GROUP_ID

## 6.3 Kriteria Device Siap Uji

1. Device merespons command STATUS.
2. Device merespons minimal TEST_FORCED_ENTRY dan TEST_BATTERY_CRITICAL.
3. Payload yang dikirim device mengandung trace_id dengan prefix lt- saat mode test.

## 7. Prosedur Pengujian

## 7.1 Baseline Smoke Test

Tujuan:

1. Validasi pipeline dan format output.

Langkah:

1. Jalankan backend.
2. Jalankan harness count kecil.
3. Verifikasi summary.md terbentuk dan memuat p95.

Contoh:

```bash
pnpm test:latency:intrusi -- --run-id lt-smoke-001 --scenario intrusi_alarm --trigger-mode device_command --count 5 --interval-ms 1500 --settle-ms 10000 --timeout-ms 120000 --sla-p95-ms 3000 --device-id <UUID_DEVICE_INTRUSI>
```

## 7.2 Uji SLA Utama

Tujuan:

1. Menilai apakah p95 E2E memenuhi target SLA.

Langkah:

1. Pilih skenario mixed agar representatif.
2. Jalankan jumlah sampel minimal 30 (lebih baik 50-100).
3. Simpan artefak summary untuk laporan.

Contoh:

```bash
pnpm test:latency:intrusi -- --run-id lt-sla-prod-001 --scenario mixed --trigger-mode device_command --count 50 --interval-ms 1500 --settle-ms 15000 --timeout-ms 240000 --sla-p95-ms 3000 --device-id <UUID_DEVICE_INTRUSI>
```

## 7.3 Uji Per Skenario

Tujuan:

1. Memetakan kontribusi latency per jenis event.

Jalankan terpisah:

1. intrusi_alarm
2. battery_critical
3. power_to_battery
4. power_to_mains

## 7.4 Uji Burst Terkontrol

Tujuan:

1. Mengukur degradasi p95/p99 saat beban tinggi namun masih aman.

Rekomendasi:

1. count 20-40
2. interval-ms 300-700
3. Jalankan di luar jam sibuk operasional.

## 8. Metode Analisis Data

## 8.1 Metrik yang Dihitung

Per trace:

1. publish_to_mqtt_ms = t1 - t0
2. mqtt_to_db_ms = t2 - t1
3. mqtt_to_alert_decision_ms = t3 - t1
4. alert_decision_to_dispatch_ms = t4 - t3
5. dispatch_to_telegram_ack_ms = t5 - t4
6. e2e_publish_to_telegram_ms = t5 - t0
7. e2e_device_to_telegram_ms = t5 - t_device

Agregasi:

1. p50
2. p95
3. p99

## 8.2 Aturan Validitas Sampel

1. Sample valid jika telegram_sent=true dan t5 ada.
2. Sample dengan error tetap dicatat untuk failure rate.
3. Missing trace row dihitung sebagai failure.

## 8.3 SLA Verdict

SLA dinyatakan PASS jika:

1. p95(E2E Publish -> Telegram ACK) <= target_sla_ms

Contoh target saat ini:

1. target_sla_ms = 3000 ms

## 9. Format Bukti untuk Laporan

Minimum bukti yang dilampirkan:

1. Ringkasan run (summary.md)
2. Raw data latency (latency_raw.csv)
3. Rekap machine-readable (summary.json)
4. Screenshot notifikasi Telegram untuk beberapa trace_id
5. Log command eksekusi harness

Template tabel laporan:

1. Kolom: Run ID, Scenario, Trigger Mode, Count, p50, p95, p99, SLA Verdict.
2. Kolom tambahan: Telegram Sent Rate, Error Rate, Cooldown Suppressed Rate.

## 10. Mitigasi Risiko Saat Uji di Production

1. Gunakan window waktu uji terjadwal (off-peak).
2. Gunakan prefix run id yang jelas (mis. lt-prod-20260415-01).
3. Batasi frekuensi trigger (interval-ms tidak terlalu kecil saat awal).
4. Mulai dari smoke test kecil sebelum run besar.
5. Simpan semua artefak per run id untuk audit trail.

## 11. Troubleshooting

1. Tidak ada row latency masuk:
   - Cek backend MQTT subscriber aktif.
   - Cek trace_id diawali lt-.
   - Cek device/harness publish ke topic yang benar.
2. Telegram tidak terkirim:
   - Cek TELEGRAM_BOT_TOKEN dan TELEGRAM_GROUP_ID.
   - Cek koneksi Telegram API dari backend.
3. Banyak cooldown_suppressed:
   - Pastikan payload test_bypass_cooldown=true ikut terbawa.
   - Cek firmware sudah menyertakan field trace saat TEST_*.
4. p95 tinggi:
   - Analisis stage breakdown, identifikasi bottleneck di t3->t5.
   - Evaluasi jaringan backend ke Telegram.

## 12. Lampiran Payload

## 12.1 Contoh Command TEST_FORCED_ENTRY

```json
{
  "cmd": "TEST_FORCED_ENTRY",
  "trace_id": "lt-lt-sla-prod-001-0001",
  "test_run_id": "lt-sla-prod-001",
  "test_scenario": "intrusi_alarm",
  "seq": 1,
  "test_bypass_cooldown": true,
  "peak_delta_g": 1.42,
  "anomaly_count": 2
}
```

## 12.2 Contoh Event Firmware dengan Trace

```json
{
  "ts": "2026-04-15T12:34:56Z",
  "device_id": "<device-id>",
  "state": "ARMED",
  "door": "CLOSED",
  "type": "FORCED_ENTRY_ALARM",
  "trace_id": "lt-lt-sla-prod-001-0001",
  "test_run_id": "lt-sla-prod-001",
  "test_scenario": "intrusi_alarm",
  "seq": 1,
  "test_bypass_cooldown": true,
  "device_ms": 12345678,
  "publish_ms": 12345678
}
```

## 13. Kesimpulan Praktis

1. Untuk pengujian latency end-to-end yang valid sebagai bahan laporan, mode yang dipakai harus device_command dengan firmware TEST_* yang sudah diflash.
2. Hasil utama yang dipakai untuk keputusan SLA adalah p95 E2E Publish -> Telegram ACK.
3. Artefak CSV/JSON/Markdown dari harness sudah memenuhi kebutuhan dokumentasi kuantitatif dan audit trail eksperimen.
