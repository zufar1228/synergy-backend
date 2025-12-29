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

## Telegram Notification Testing Scripts

Automated scripts to test the complete Telegram notification flow for the keamanan (security) system.

### Files

- `telegram-notification-simulator.js` - Uploads real images and creates repeat detections
- `run-telegram-test.bat` - Windows batch script for one-click testing
- `run-telegram-test.ps1` - PowerShell script for one-click testing

### Prerequisites

1. **Environment Setup**: Ensure your backend is running with proper Supabase and Telegram configuration
2. **Test Image**: Place a `test.jpg` file in this directory (the script uploads real images)
3. **Dependencies**: Run `pnpm install` in the backend root directory

### Usage

#### Option 1: Batch Script (Recommended for Windows)
```bash
# Double-click the file or run from command prompt
run-telegram-test.bat
```

#### Option 2: PowerShell Script
```powershell
# Right-click and "Run with PowerShell" or execute in PowerShell terminal
.\run-telegram-test.ps1
```

#### Option 3: Testing with Deployed Backend
If you want to test with your deployed backend (api.synergyiot.ninja):

**Batch Script:**
```bash
run-telegram-test-deployed.bat
```

**PowerShell Script:**
```powershell
.\run-telegram-test-deployed.ps1
```

**Before using deployed scripts:**
1. Replace `YOUR_JWT_TOKEN_HERE` with your actual JWT token
2. Get the JWT token by:
   - Logging into https://synergyiot.ninja
   - Opening browser dev tools (F12)
   - Going to Network tab
   - Making any API call and copying the `authorization` header value

#### Option 4: Manual Steps
If you prefer to run manually:

1. **Upload images and create detections**:
   ```bash
   cd device-simulator
   node telegram-notification-simulator.js
   ```

2. **Trigger notifications**:
   ```bash
   cd ..
   npx ts-node -e "import('./src/services/repeatDetectionService').then(({ findAndNotifyRepeatDetections }) => findAndNotifyRepeatDetections().then(() => console.log('✅ Telegram notification sent!')).catch(console.error));"
   ```

### What Happens

1. **Image Upload**: Real `test.jpg` uploaded to Supabase Storage with public URL
2. **Detection Creation**: Creates 3 repeat person detections **within 15 seconds** with the real image URL
3. **Notification Trigger**: Automatically sends Telegram alert to your configured group
4. **Frontend Display**: Images appear in the keamanan dashboard

### Verification

- **Telegram**: Check your Telegram group for security alerts with images
- **Frontend**: Visit `http://localhost:3000` → Keamanan section to see uploaded images
- **Console**: Scripts provide clear success/failure feedback

### Troubleshooting

- **"test.jpg not found"**: Ensure the image file exists in the device-simulator directory
- **"Supabase error"**: Check your Supabase configuration and credentials
- **"Telegram not sent"**: Verify Telegram bot token and chat ID in your config
- **Build errors**: Run `pnpm run build` in the backend directory first

### Customization

- **Change detection count**: Edit `NUM_DETECTIONS` in `telegram-notification-simulator.js`
- **Modify shirt colors**: Change the `shirtColors` array for different notification triggers
- **Add delays**: Adjust `setTimeout` values if needed for testing
