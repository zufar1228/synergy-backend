// device-simulator/upload-simulator.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// --- KONFIGURASI (WAJIB DIISI) ---

// 1. Ganti dengan UUID perangkat 'keamanan' Anda
const TARGET_DEVICE_ID = "4cd41258-296f-4c30-8e22-c0dab7d4f950"; // Kamera Keamanan 1

// 2. Ganti dengan nama file gambar lokal Anda
const LOCAL_IMAGE_PATH = "C:\\Users\\FSOS\\Documents\\Magang SMT7\\iot-monitoring-system\\simulator\\test_image.jpg";

// 3. Ganti dengan nama bucket storage Anda
const BUCKET_NAME = 'captured_images';

// ---------------------------------

// Inisialisasi Klien Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Error: Pastikan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY ada di file .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Fungsi utama
async function uploadAndQueue() {
  console.log(`Membaca file: ${LOCAL_IMAGE_PATH}...`);

  // 1. Baca file gambar dari disk
  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(LOCAL_IMAGE_PATH);
  } catch (e) {
    console.error(`🔴 Gagal membaca file: ${e.message}`);
    console.log("Pastikan nama file di 'LOCAL_IMAGE_PATH' sudah benar.");
    console.log("Atau buat file test.jpg dummy untuk testing.");
    return;
  }

  // 2. Buat nama file unik untuk di storage
  const image_path = `${TARGET_DEVICE_ID}/${Date.now()}.jpg`;

  // 3. Upload file ke Supabase Storage
  console.log(`Mengunggah ke Storage bucket '${BUCKET_NAME}' sebagai '${image_path}'...`);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(image_path, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (uploadError) {
    console.error("🔴 Gagal mengunggah ke Storage:", uploadError.message);
    return;
  }
  console.log("✅ Berhasil diunggah ke Storage!");

  // 4. Masukkan data ke tabel 'pending_images'
  console.log("Memasukkan data ke tabel 'pending_images'...");
  const { error: insertError } = await supabase
    .from('pending_images')
    .insert({
      device_id: TARGET_DEVICE_ID,
      image_path: image_path,
      status: 'pending' // Atur status sebagai pending
    });

  if (insertError) {
    console.error("🔴 Gagal memasukkan ke tabel 'pending_images':", insertError.message);
    return;
  }

  console.log("✅ Berhasil! Gambar sudah masuk antrian.");
  console.log("Skrip Python ML akan mengambilnya dalam beberapa detik.");
}

// Cek konfigurasi sebelum menjalankan
if (TARGET_DEVICE_ID === "uuid-perangkat-keamanan-anda-di-sini") {
  console.error("❌ BERHENTI: Harap edit file 'upload-simulator.js' dan isi 'TARGET_DEVICE_ID' dengan UUID perangkat Anda.");
} else {
  uploadAndQueue();
}