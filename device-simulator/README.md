# Device Simulator

Simulator untuk testing sistem IoT tanpa hardware fisik.

## Intrusi Simulator

Simulator untuk TinyML Intrusion Detection (ESP32-S3).

### 💡 Catatan Penting

**TinyML hanya mengirim data ketika INTRUSI terdeteksi!**

- Normal → Diproses lokal di ESP32, **TIDAK dikirim**
- Disturbance → Diproses lokal di ESP32, **TIDAK dikirim**  
- **Intrusion** → **DIKIRIM ke cloud** + trigger Telegram alert!

Ini adalah keunggulan TinyML edge processing - hemat bandwidth dan baterai.

### ⚠️ MQTT Credentials

**Setiap device punya MQTT credentials sendiri!**

Credentials dibuat saat device di-register di web app:
- **Username**: `device-{deviceId}`
- **Password**: `pwd-{deviceId}-{timestamp}`

Credentials hanya ditampilkan **SEKALI** saat device dibuat. Simpan baik-baik!

### Cara Penggunaan

#### 1. Quick Test Mode (Recommended)

Mode ini mengirim 3 INTRUSION events untuk testing cepat:

```bash
pnpm simulator:intrusi <warehouseId> <areaId> <deviceId> <mqttUsername> <mqttPassword> --quick
```

Contoh:
```bash
pnpm simulator:intrusi \
  abc123-warehouse-uuid \
  def456-area-uuid \
  ghi789-device-uuid \
  device-ghi789-device-uuid \
  pwd-ghi789-device-uuid-1234567890 \
  --quick
```

Output:
```
🚨 [INTRUSION 1/3] Confidence: 88.0%
📤 Sent: {"event":"Intrusion","conf":0.88,"ts":"..."}
   → Telegram notification should be sent!

🚨 [INTRUSION 2/3] Confidence: 92.0%
🚨 [INTRUSION 3/3] Confidence: 96.0%
✅ QUICK TEST COMPLETE!
```

#### 2. Continuous Mode

Mode ini mensimulasikan TinyML edge processing:
- 90% waktu: tidak ada intrusi (tidak kirim data)
- 10% waktu: INTRUSION detected (kirim ke cloud)

```bash
pnpm simulator:intrusi <warehouseId> <areaId> <deviceId> <mqttUsername> <mqttPassword>
```

Tekan `Ctrl+C` untuk stop.

### Cara Mendapatkan Credentials

#### Step 1: Buat Device di Web App

1. Login ke web app
2. Tambah device baru dengan type `intrusi`
3. **PENTING**: Copy MQTT credentials yang muncul setelah device dibuat!
   - `mqtt_username`: device-{deviceId}
   - `mqtt_password`: pwd-{deviceId}-{timestamp}

#### Step 2: Dapatkan IDs dari Supabase

Run this SQL in Supabase SQL Editor:

```sql
SELECT 
  d.id as device_id,
  d.name as device_name,
  a.id as area_id,
  a.name as area_name,
  w.id as warehouse_id,
  w.name as warehouse_name
FROM devices d
JOIN areas a ON d.area_id = a.id
JOIN warehouses w ON a.warehouse_id = w.id
WHERE d.system_type = 'intrusi'
LIMIT 1;
```

### Environment Variables (Optional)

Untuk tidak perlu ketik parameter setiap kali, tambahkan di `.env`:

```env
WAREHOUSE_ID=your-warehouse-uuid
AREA_ID=your-area-uuid
INTRUSI_DEVICE_ID=your-device-uuid
DEVICE_MQTT_USERNAME=device-your-device-uuid
DEVICE_MQTT_PASSWORD=pwd-your-device-uuid-1234567890
```

Lalu jalankan:
```bash
pnpm simulator:intrusi --quick
```

### Format Payload MQTT

TinyML hanya mengirim satu jenis event:

```json
{
  "event": "Intrusion",
  "conf": 0.95,
  "ts": "2025-01-15T10:30:00.000Z"
}
```

### Topic MQTT

```
warehouses/{warehouseId}/areas/{areaId}/devices/{deviceId}/sensors/intrusi
```

### Troubleshooting

#### Connection refused / Authentication failed
- Pastikan menggunakan **device credentials**, bukan backend credentials
- Credentials format: `device-{deviceId}` dan `pwd-{deviceId}-{timestamp}`
- Credentials hanya ditampilkan SEKALI saat device dibuat

#### Tidak ada Telegram notification
- Cek backend logs untuk `[TinyML]` dan `[Alerting]` messages
- Pastikan backend sedang berjalan dan terhubung ke MQTT

#### Data tidak muncul di analytics
- Cek backend logs untuk `[IntrusiService]`
- Verifikasi device ID ada di database
- Cek tabel `intrusi_logs` di Supabase
