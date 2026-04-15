# Intrusi Latency Harness

Dokumen ini menjelaskan cara menjalankan uji latensi end-to-end untuk sistem intrusi secara otomatis.

## Tujuan

Harness ini mengukur latensi multi-stage per trace:

1. Publish -> MQTT RX backend
2. MQTT RX -> DB insert (khusus event sensor intrusi)
3. MQTT RX -> Alert decision
4. Alert decision -> Notification dispatch
5. Dispatch -> Telegram API ACK
6. E2E Publish -> Telegram ACK
7. E2E Device -> Telegram ACK (jika `device_ms` diisi dari firmware)

Semua stage disimpan di tabel Postgres `intrusi_latency_trace`.

## Menjalankan Harness

Pastikan backend berjalan dan environment production sudah aktif.

```bash
pnpm test:latency:intrusi -- \
  --run-id lt-prod-2026-04-15 \
  --scenario mixed \
  --trigger-mode device_command \
  --count 40 \
  --interval-ms 1500 \
  --settle-ms 10000 \
  --timeout-ms 180000 \
  --sla-p95-ms 3000 \
  --device-id <UUID_DEVICE_INTRUSI>
```

Argumen penting:

- `--scenario`: `intrusi_alarm`, `battery_critical`, `power_to_battery`, `power_to_mains`, `mixed`
- `--trigger-mode`: `device_command` (default) atau `direct_mqtt`
- `--count`: jumlah trace
- `--interval-ms`: jeda antar trace
- `--sla-p95-ms`: target SLA p95 untuk metrik E2E Publish -> Telegram ACK
- `--cleanup-before=true`: hapus row lama dengan run id yang sama sebelum test

## Mode Trigger

1. `device_command` (disarankan untuk end-to-end asli dari firmware)
  - Harness publish command ke topic `.../commands`.
  - Firmware mengeksekusi command test (`TEST_*`) lalu firmware sendiri yang publish event/status.
  - Ini mode yang merepresentasikan latensi real dari sisi perangkat.

2. `direct_mqtt` (fallback/simulasi backend pipeline)
  - Harness publish langsung ke topic sensor/status.
  - Berguna untuk validasi cepat ketika device fisik belum diflash.

Output report:

- `tests/latency/reports/<run-id>/latency_raw.csv`
- `tests/latency/reports/<run-id>/summary.json`
- `tests/latency/reports/<run-id>/summary.md`

## Firmware Requirement (untuk device-real latency)

Harness ini sudah mengirim field trace langsung ke MQTT payload. Untuk mengukur *latensi dari device real* (bukan hanya publish dari harness), firmware intrusi perlu mengisi field berikut saat publish event:

- `trace_id` (string, format disarankan diawali `lt-`)
- `test_run_id` (string)
- `test_scenario` (string)
- `device_ms` (epoch ms dari device saat event dibuat)
- `publish_ms` (epoch ms saat payload dipublish)
- `test_bypass_cooldown` (boolean, khusus mode uji)

Firmware yang sudah dimodifikasi di codebase ini menambahkan command uji berikut:

- `TEST_FORCED_ENTRY`
- `TEST_UNAUTHORIZED_OPEN`
- `TEST_BATTERY_CRITICAL`
- `TEST_POWER_TO_BATTERY`
- `TEST_POWER_TO_MAINS`

Jika firmware saat ini belum mengirim field di atas, hasil `E2E Device -> Telegram ACK` tidak akan representatif. Dalam kondisi itu, flash firmware baru diperlukan untuk uji latency device-real.

## Catatan Produksi

- Trace latensi hanya direkam bila `trace_id` diawali `lt-`.
- Dedup MQTT dan cooldown alert tetap aktif untuk traffic normal.
- Untuk trace test, cooldown bisa di-bypass lewat field `test_bypass_cooldown=true`.
