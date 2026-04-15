# Ringkasan Uji Latensi Intrusi

- Run ID: lt-smoke-direct-20260415
- Device: Door Guardian (8e819e4a-9710-491f-9fbc-741892ae6195)
- Lokasi: Tangrang / Pintu Depan
- Scenario input: intrusi_alarm
- Trigger mode: direct_mqtt
- Jumlah trace dikirim: 1
- Jumlah trace terekam: 1
- Telegram terkirim: 0
- Cooldown suppressed: 0
- Trace error/missing: 1
- SLA target: p95 E2E Publish -> Telegram ACK <= 3000 ms
- Hasil SLA: FAIL

## Percentile Metrik (ms)
| Metrik | Samples | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Publish -> MQTT RX | 0 | - | - | - |
| MQTT RX -> DB Insert | 0 | - | - | - |
| MQTT RX -> Alert Decision | 0 | - | - | - |
| Alert Decision -> Dispatch | 0 | - | - | - |
| Dispatch -> Telegram ACK | 0 | - | - | - |
| E2E Publish -> Telegram ACK | 0 | - | - | - |
| E2E Device -> Telegram ACK | 0 | - | - | - |

## Error Trace (max 30)
- lt-lt-smoke-direct-20260415-0001: missing_trace_row

## Artefak
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-smoke-direct-20260415\latency_raw.csv
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-smoke-direct-20260415\summary.json
- C:\Users\FSOS\Documents\TA\Synergy IOT Poject\backend\tests\latency\reports\lt-smoke-direct-20260415\summary.md
