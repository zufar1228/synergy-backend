# AI Agent Execution Rules (Mandatory)

Dokumen ini adalah aturan WAJIB untuk setiap AI agent yang bekerja di repository ini.  
Jika ada konflik dengan instruksi biasa, aturan di dokumen ini diprioritaskan.

## A. Efisiensi Eksekusi (Mandatory)

1. Hindari membaca keseluruhan file besar jika tidak diperlukan; baca hanya blok fungsi/section terkait.
2. Proses harus super efisien: minim command, minim file read, langsung ke target.
3. Jangan mencampur banyak fungsi/logic dalam satu file; pecah ke module kecil yang jelas tanggung jawabnya.
4. Jika ada inisiatif di luar request user, **wajib minta persetujuan dulu** sebelum eksekusi.

## B. Hard Instruction Dokumentasi (Mandatory)

Semua file yang dibuat/diubah wajib punya header doc ringkas di bagian paling atas file.

### Header doc minimal berisi:
- Tujuan file/module
- Dipakai oleh siapa (caller/route/controller)
- Dependensi utama (service/repo/API)
- Daftar fungsi public/utama
- Side effect penting (DB read/write, HTTP call, file I/O)

### Aturan tambahan:
- Jika file sudah punya header doc, wajib update agar tetap akurat setelah perubahan.
- Dilarang menambah/mengubah logic tanpa menyesuaikan header doc.
- Format harus ringkas, konsisten, dan mudah dipindai cepat.

## C. Standar Query/Database (Mandatory, Senior DBA Grade)

1. Rancang query dengan prinsip **minimum cost, minimum I/O, minimum lock contention**.
2. Selalu evaluasi:
   - cardinality/selectivity filter,
   - pemakaian index yang tepat,
   - join order & join strategy,
   - dampak ke CPU, memory, disk, network.
3. Hindari pola boros resource (proses berulang, temp table tidak perlu, write berlapis, N+1 query) jika bisa dioptimalkan.
4. Pilih strategi paling efisien sesuai konteks (upsert/merge/batch/incremental/query rewrite), bukan template tunggal.
5. Pastikan aman di skala besar: transactional consistency tepat, locking minimal, performa stabil saat data tumbuh.
6. Sebelum finalize perubahan DB-heavy, wajib jelaskan singkat:
   - alasan efisiensi,
   - trade-off,
   - risiko performa yang dihindari.

## D. Kontrak Output Agent (Wajib di setiap task)

Sebelum coding:
- Berikan rencana singkat (3-7 langkah).
- Sebut file target yang akan diubah.

Setelah coding:
- Daftar file yang diubah.
- Ringkasan perubahan per file.
- Konfirmasi header doc sudah ditambahkan/diupdate.
- Catatan performa untuk perubahan DB/query (jika ada).
- Sebutkan jika ada usulan di luar request dan status persetujuannya.

## E. Template Header Doc (Gunakan di setiap file)

> Sesuaikan dengan bahasa file (JS/TS/Python/Go/Java/SQL, dll).

```text
/**
 * File Purpose:
 * Used By:
 * Main Dependencies:
 * Public/Main Functions:
 * Important Side Effects:
 */
```

## F. Mandatory Session Bootstrap

Setiap agent yang memulai sesi harus:
1. Membaca file `AI_AGENT_RULES.md` ini terlebih dahulu.
2. Mengonfirmasi: **“Rules loaded. I will enforce this flow strictly.”**
3. Baru melanjutkan eksekusi task.

---
Last Updated: 2026-04-19
Owner: @zufar1228