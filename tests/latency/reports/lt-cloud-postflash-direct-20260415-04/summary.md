# Ringkasan Uji Latensi Intrusi

- Run ID: lt-cloud-postflash-direct-20260415-04
- Run tag (payload): lt-ltcloudp-31oe64
- Device: Door Guardian (8e819e4a-9710-491f-9fbc-741892ae6195)
- Lokasi: Tangrang / Pintu Depan
- Scenario input: intrusi_alarm
- Trigger mode: direct_mqtt
- Base topic: warehouses/eec544fc-bacb-4568-bc46-594ed5b5616f/areas/4eb04ea1-865c-4043-a982-634ed59f6c7e/devices/8e819e4a-9710-491f-9fbc-741892ae6195
- Sumber base topic: db_device_context
- Jumlah trace dikirim: 30
- Jumlah trace terekam: 30
- Telegram terkirim: 20
- Cooldown suppressed: 0
- Trace error/missing: 0
- SLA target: p95 E2E Publish -> Telegram ACK <= 3000 ms
- Hasil SLA: PASS

## Percentile Metrik (ms)
| Metrik | Samples | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Publish -> MQTT RX | 0 | - | - | - |
| MQTT RX -> DB Insert | 30 | 23.0 | 24.5 | 25.0 |
| MQTT RX -> Alert Decision | 30 | 31.0 | 32.0 | 32.7 |
| Alert Decision -> Dispatch | 30 | 15.0 | 16.5 | 18.4 |
| Dispatch -> Telegram ACK | 30 | 387.5 | 472.3 | 666.0 |
| E2E Publish -> Telegram ACK | 1 | 200.0 | 200.0 | 200.0 |
| E2E Device -> Telegram ACK | 1 | 200.0 | 200.0 | 200.0 |

## Error Trace (max 30)
- Tidak ada error trace.

## Artefak
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-direct-20260415-04\latency_raw.csv
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-direct-20260415-04\summary.json
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-direct-20260415-04\summary.md
