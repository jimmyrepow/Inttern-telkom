# TELKOM AKSES INTERNSHIP - Website Absensi

Website absensi peserta magang **TELKOM AKSES**. Frontend memakai **Bootstrap 5**
dan JavaScript modular tanpa build tool. Data disimpan di **Supabase PostgreSQL**
dan foto absensi di **Supabase Storage**. Login memakai username + password biasa,
tanpa email dan tanpa Supabase Auth.

Seluruh website berada langsung di **root project** (tidak ada folder `website`,
`WEB`, `supabase_web`, atau `gas_push_telkom`). Versi Google Apps Script sudah
tidak dipakai.

## Struktur folder

```
/
  index.html                halaman utama
  server.js                 server statis lokal
  run.bat                   jalankan website sekali klik
  migrate.bat               install + migrasi + seed + pemeriksaan
  doctor.bat                pemeriksaan sistem
  package.json
  .env                      kredensial asli (jangan di-commit)
  .env.example              contoh kredensial
  assets/
    css/styles.css
    js/
      config.js             URL + publishable key Supabase
      app.js                entry point: sesi, dashboard, auto-refresh
      core/
        config.js           pembacaan konfigurasi
        session.js          simpan/baca/hapus token
        store.js            state aplikasi
        api.js              klien Supabase, RPC, penanganan error
      lib/
        dom.js              escape HTML, toast, modal, tombol sibuk
        format.js           tanggal, jam, status, akun aktif
        render.js           potongan tampilan bersama
      services/
        photo.js            kamera, kompresi, upload, hapus foto
        location.js         GPS dan tampilan lokasi
        export.js           export Excel
      views/
        login.js            halaman login
        admin.js            dashboard admin
        intern.js           dashboard intern dan absensi
        guide.js            halaman panduan penggunaan
  scripts/
    db.js                   koneksi PostgreSQL + retry
    migrate.js              runner migrasi otomatis
    seed.js                 seed akun awal
    doctor.js               cek database, bucket, RPC, login
  supabase/
    migrations/
      0001_schema.sql
      0002_admin_accounts.sql
      0003_simple_users.sql
      0004_security_cleanup.sql
      0005_interns.sql      akun peserta magang
      0006_attendance_edit_and_checkout_limit.sql
```

### Aturan modularisasi

- `app.js` hanya mengatur alur: login, dashboard, auto-refresh, logout.
- Tampilan per halaman ada di `views/`.
- Logika yang dipakai ulang (kamera, GPS, Excel) ada di `services/`.
- Helper kecil ada di `lib/`; konfigurasi, sesi, state, dan API ada di `core/`.
- Tambah fitur baru dengan membuat modul baru lalu impor dari `app.js` atau view
  terkait. Jangan menaruh seluruh logika di satu file.
- Frontend memakai ES module (`<script type="module">`), jadi harus dibuka lewat
  HTTP (`npm run dev`), bukan `file://`.

## Prasyarat

- Node.js 18 atau lebih baru.
- Akses internet ke `*.supabase.co`.
- Koneksi database langsung memakai IPv6. Jika jaringan tidak mendukung IPv6,
  gunakan **Session Pooler** dari Supabase Dashboard (lihat Troubleshooting).

## 1. Environment

File **`.env`** (bukan `.env.local`) cukup berisi konfigurasi Supabase:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_URL=postgresql://postgres:<password-ter-encode>@db.<project-ref>.supabase.co:5432/postgres
```

- `SUPABASE_SECRET_KEY` hanya untuk server. Jangan pernah memasukkannya ke
  `assets/js/config.js` atau file yang di-deploy ke browser.
- Password pada `DATABASE_URL` harus di-URL-encode. Variabel `PGHOST`,
  `PGPORT`, `PGUSER`, `PGPASSWORD`, dan `PGDATABASE` hanya diperlukan jika
  memilih konfigurasi koneksi terpisah sebagai pengganti `DATABASE_URL`.
- Port server lokal default ke `5500`; variabel `PORT` hanya opsional.
- Kredensial seed dan login test tidak perlu ditaruh di `.env`.

## 2. Install dependency

```bash
npm install
```

Dependency hanya `pg` dan `dotenv`. Frontend memakai CDN, tanpa build tool.

## 3. Migrasi database

```bash
npm run migrate
npm run migrate:status
```

Migrasi berjalan berurutan, dihitung checksum SHA-256, dan dijalankan dalam
transaksi. File yang sudah sama dilewati (`SKIP`). Untuk perubahan skema baru,
buat file di `supabase/migrations/` dengan nomor berikutnya; jangan mengedit
migrasi yang sudah dipakai di production.

Migrasi `0006_attendance_edit_and_checkout_limit.sql` menambahkan batas jam
pulang dengan nilai awal `17:00`, validasi pulang di database, dan RPC admin
untuk mengoreksi status serta jam masuk/pulang. Terapkan dengan `npm run migrate`,
lalu verifikasi dengan `npm run migrate:status`.

`0005_interns.sql` menambahkan akun peserta magang:

| Username | Password  | Nama lengkap        |
|----------|-----------|---------------------|
| nayla    | nayla123  | Nayla Rehanna       |
| cut      | cut123    | Cut Mauliza Putri   |
| nadya    | nadya123  | Nadya Gustiyani     |
| nur      | nur123    | Nur Aini Hasanah    |
| gina     | gina123   | Gina Azarifa Ane    |
| lucy     | lucy123   | Lucy Renata         |

Akun admin dan intern awal:

| Username | Password | Role   |
|----------|----------|--------|
| dhea     | dhea123  | admin  |
| jimmy    | jimmy123 | intern |

**Aturan akun peserta:** username = nama depan (huruf kecil), password = nama
depan + `123`, contoh `nayla` / `nayla123`. Password disimpan sebagai hash
bcrypt, bukan teks biasa, sehingga tidak bisa dibaca kembali dari database.

## 4. Seed akun

```bash
npm run seed
```

Seed bersifat idempotent:

- Username yang belum ada akan dibuat dengan password bcrypt.
- Username yang sudah ada akan diperbarui nama, role, dan status aktifnya.
- Password tidak direset kecuali `SEED_RESET_PASSWORDS=true`.

## 5. Pemeriksaan sistem

```bash
npm run doctor
```

Yang diperiksa: koneksi PostgreSQL, tabel utama, bucket `attendance-photos`,
RPC penting (`app_login`, `app_bootstrap`, `admin_reset_password`), kolom
password/login, daftar akun, serta uji login memakai `CHECK_LOGIN_*`.
Status akhir harus `STATUS : OK`.

## 6. Menjalankan website

```bash
.\run.bat
```

atau:

```bash
npm run dev
```

Buka `http://localhost:5501`. Jangan membuka `index.html` lewat `file://` jika
ingin memakai kamera dan GPS; browser hanya mengizinkan keduanya pada
`localhost` atau HTTPS.

Alur pemakaian:

1. Login dengan username dan password.
2. Admin melihat statistik, daftar absensi, daftar peserta, pengaturan, dan
   export Excel.
3. Intern melihat status hari ini, form absen masuk/pulang, GPS, selfie, dan
   riwayat pribadi.

Token sesi disimpan di `localStorage` dan berlaku 12 jam. Setiap RPC mengirim
token sebagai `p_token`; server memvalidasinya ke tabel `public.sessions`.

## 7. Tampilan dan notifikasi

- Notifikasi dan konfirmasi memakai **SweetAlert2** dengan animasi ringan.
  Jika CDN tidak tersedia, aplikasi tetap memakai notifikasi dan dialog
  cadangan yang sudah ada.
- Semua tombol aksi menampilkan status sibuk dan hasil akhir berupa toast, agar
  pengguna tahu proses sedang berjalan atau sudah selesai.
- Dashboard memakai sidebar dan header yang konsisten; di HP dan tablet sidebar
  dibuka lewat tombol menu di header, di desktop sidebar tampil permanen.
- Layout mobile-first: tabel beralih menjadi kartu di HP, grid statistik menjadi
  3 kolom di tablet, dan desktop memakai sidebar penuh dengan konten yang
  dibatasi lebarnya.
- Menu **Panduan** memuat langkah penggunaan sesuai peran, keamanan akun,
  sinkronisasi, serta solusi untuk kendala GPS, kamera, dan login.

### Panduan singkat peserta

1. Login dengan username dan password yang diberikan admin.
2. Buka **Absen**, izinkan akses GPS, ambil atau unggah foto, lalu tekan
   **Absen Masuk**.
3. Tekan **Absen Pulang** mulai dari jam pulang yang ditetapkan admin (default
   **17:00**, mengikuti zona waktu aplikasi). Sebelum waktunya, tombol
   dinonaktifkan dan server juga menolak permintaan pulang lebih awal.
4. Buka **Riwayat** untuk memeriksa catatan kehadiran milik sendiri.

### Panduan singkat admin

1. Buka **Peserta** untuk membuat akun, mengubah status, atau reset password.
2. Buka **Absensi** untuk mencari dan memfilter catatan peserta; gunakan
   **Export** untuk mengunduh laporan.
3. Buka **Pengaturan** untuk mengatur batas telat masuk, jam mulai absen pulang,
   zona waktu, dan lokasi/radius kantor. Jam pulang default **17:00** dan dapat
   diubah oleh admin.
4. Buka **Panduan** kapan saja untuk langkah rinci dan pemecahan masalah.

## 8. Password dan akun

- `public.users.password` berisi hash bcrypt.
- `public.users.password_updated_at` menyimpan waktu terakhir password diubah.
- `public.users.last_login_at` menyimpan waktu login terakhir.
- Admin dapat mengganti password lewat **Peserta > Reset password** (modal
  password dengan konfirmasi) atau form **Edit**.
- RPC yang dipakai: `admin_reset_password(p_token, p_id, p_password)`.
- Semua aksi reset password dicatat di `public.logs`.

## 9. Fitur

- Login username + password tanpa email dan tanpa Supabase Auth.
- Sesi otomatis diperiksa ulang; sesi kedaluwarsa diarahkan ke login.
- Dashboard admin:
  - Statistik peserta, hadir, tepat waktu, telat, belum absen.
  - Filter absensi berdasarkan pencarian, tanggal, dan status.
  - Edit status kehadiran, jam masuk, dan jam pulang; perubahan dicatat di log.
  - Tambah/edit peserta, reset password, aktif/nonaktifkan akun.
  - Hapus satu absensi, hapus seluruh absensi peserta, hapus akun.
  - Pengaturan nama aplikasi, batas telat, jam mulai pulang, zona waktu, kantor, radius.
  - Export Excel (Users, Attendance, Settings, Logs).
- Dashboard intern:
  - Absen masuk dan pulang.
  - Absen pulang dikunci sebelum jam yang ditetapkan dan dicek kembali oleh database.
  - Ambil GPS dan tampilkan akurasi.
  - Kamera browser atau upload foto; foto dikompres ke JPEG.
  - Riwayat absensi pribadi di halaman terpisah.
- Panduan penggunaan bawaan untuk intern dan admin.
- Auto-refresh data setiap 30 detik saat tab aktif.
- Tampilan responsif mobile, tablet, dan desktop dengan tema pink TELKOM AKSES.

## 10. Update data dan kode

- **Skema database**: tambah file migrasi baru lalu `npm run migrate`.
- **Akun seed**: jalankan `npm run seed`; tinjau akun default di
  `scripts/seed.js` sebelum menjalankannya pada database sebenarnya.
- **Frontend**: edit modul terkait di `assets/js/`.
  - Halaman/login: `views/`
  - Kamera/GPS/Excel: `services/`
  - Helper: `lib/`
  - API/sesi/state: `core/`
- **Kredensial**: edit `.env` lalu jalankan ulang perintah database.
- **Publishable key**: edit `assets/js/config.js` dan `.env`.

## 11. Keamanan

- `.env` masuk `.gitignore`; jangan commit file ini.
- `SUPABASE_SECRET_KEY` dan password database tidak boleh ada di frontend.
- RLS aktif di semua tabel. `users` dan `sessions` tidak dapat dibaca langsung
  dari browser; akses hanya lewat RPC `security definer`.
- Semua RPC memvalidasi token sesi. RPC admin memeriksa role admin.
- Bucket foto bersifat publik untuk kemudahan tampilan; path memakai UUID user.
- Segera rotate `SUPABASE_SECRET_KEY` dan password database jika pernah
  terekspos di chat, screenshot, atau repositori.
- Tidak perlu mengaktifkan provider Auth apa pun di Supabase Dashboard.

## 12. Troubleshooting

### `getaddrinfo ENOTFOUND db.<ref>.supabase.co`

Host database Supabase hanya memiliki record IPv6. Gunakan **Session Pooler**:

1. Buka Supabase Dashboard > **Project Settings > Database**.
2. Salin connection string **Session Pooler**.
3. Ganti `DATABASE_URL` dengan connection string **Session Pooler**. Contoh
   host: `aws-0-<region>.pooler.supabase.com`, user `postgres.<ref>`.

Script sudah mencoba koneksi ulang otomatis beberapa kali.

### Port 5501 sudah dipakai

Jalankan server dengan variabel `PORT` diatur ke angka lain (misalnya `5502`),
lalu jalankan `run.bat` atau `npm run dev`. Jika tidak disetel, port default
adalah `5500`.

### Login gagal / `fetch failed`

- Pastikan `SUPABASE_URL` benar dan project tidak sedang paused.
- Jalankan `npm run migrate:status` dan `npm run doctor`.
- Coba buka `https://<project-ref>.supabase.co/rest/v1/` di browser.
- Jaringan tertentu sempat memblokir sementara Cloudflare; coba lagi.

### Kamera atau GPS tidak muncul

- Jalankan lewat `http://localhost:5501`, bukan `file://`.
- Izinkan kamera/lokasi di browser.
- Untuk deployment, gunakan HTTPS.

### Halaman kosong setelah update

- Pastikan membuka lewat server (`npm run dev`), karena frontend memakai ES
  module.
- Buka konsol browser; kesalahan impor modul akan terlihat di sana.
- Pastikan `assets/js/config.js` berisi URL dan publishable key yang benar.

## 13. Deploy frontend

Konfigurasi [Vercel](./vercel.json) menggunakan preset **Other**, menjalankan
`npm run build`, lalu menerbitkan folder `dist/`. Build hanya menyalin:

```
index.html
assets/
```

Impor repository ke Vercel dengan root directory `/`; pengaturan build dan
output sudah didefinisikan di `vercel.json`. Frontend memakai Supabase URL dan
publishable key dari `assets/js/config.js`, jadi tidak perlu menambahkan
`SUPABASE_SECRET_KEY`, `DATABASE_URL`, atau `PGPASSWORD` ke environment
deployment frontend. Jangan deploy `.env`, `scripts/`, `supabase/`,
`node_modules/`, workbook database, atau file `.bat`.

Untuk platform statis lain, deploy hanya `index.html` dan `assets/`.
