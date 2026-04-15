# Ringkasan Uji Latensi Intrusi

- Run ID: lt-cloud-postflash-20260415-06
- Run tag (payload): lt-ltcloudp-k210q4
- Device: Door Guardian (8e819e4a-9710-491f-9fbc-741892ae6195)
- Lokasi: Tangrang / Pintu Depan
- Scenario input: intrusi_alarm
- Trigger mode: device_command
- Base topic: warehouses/eec544fc-bacb-4568-bc46-594ed5b5616f/areas/4eb04ea1-865c-4043-a982-634ed59f6c7e/devices/8e819e4a-9710-491f-9fbc-741892ae6195
- Sumber base topic: mqtt_observed
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
| Publish -> MQTT RX | 1 | 0.0 | 0.0 | 0.0 |
| MQTT RX -> DB Insert | 30 | 19.0 | 23.1 | 66.6 |
| MQTT RX -> Alert Decision | 30 | 25.0 | 29.5 | 75.4 |
| Alert Decision -> Dispatch | 30 | 13.0 | 13.5 | 14.7 |
| Dispatch -> Telegram ACK | 30 | 392.0 | 479.7 | 681.0 |
| E2E Publish -> Telegram ACK | 30 | 423.5 | 513.6 | 765.1 |
| E2E Device -> Telegram ACK | 30 | 423.5 | 513.6 | 765.1 |

## Error Trace (max 30)
- Tidak ada error trace.

## Artefak
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-20260415-06\latency_raw.csv
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-20260415-06\summary.json
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-cloud-postflash-20260415-06\summary.md
