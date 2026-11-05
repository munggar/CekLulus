# CekLulus

## Menjalankan dengan PostgreSQL

1. Pasang PostgreSQL 17 untuk Windows melalui **PowerShell yang dibuka sebagai Administrator**:

   ```powershell
   winget install --id PostgreSQL.PostgreSQL.17 --exact --accept-source-agreements --accept-package-agreements
   ```

   Pada installer, pilih port `5432` dan tetapkan password untuk akun database `postgres`.
2. Buka `server/.env`. Pada `DATABASE_URL`, ganti bagian password setelah `postgres:` dengan password yang baru dibuat di installer. File ini sudah diisi secret aplikasi. Atur `ADMIN_PASSWORD` ke password admin pilihan Anda (minimal 12 karakter); jangan membagikan atau commit file ini.
3. Buat database kosong bernama `ceklulus` menggunakan SQL shell `psql`:

   ```sql
   CREATE DATABASE ceklulus;
   ```

4. Dari folder proyek, instal dependency dan jalankan backend:

   ```powershell
   npm.cmd --prefix server install
   npm.cmd --prefix server start
   ```

5. Buka `http://localhost:3001`. Backend menyiapkan tabel PostgreSQL secara otomatis saat pertama dijalankan. Login admin memakai `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari `server/.env`.

`AUTH_TOKEN_SECRET` harus berupa nilai acak minimal 32 karakter. Contoh untuk membuatnya dengan Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Akun mahasiswa, hash kata sandi, konfigurasi aturan studi, KHS, rencana, dan riwayat chat disimpan di PostgreSQL. Token autentikasi di browser hanya digunakan untuk membuktikan sesi masuk; token tersebut bukan penyimpanan data aplikasi. Service worker juga tidak menyimpan respons API ke cache offline.

Jika browser masih memiliki akun/data dari versi lama, masuk dengan kredensial lama untuk memindahkan akun dan data KHS ke PostgreSQL. Setelah migrasi berhasil, salinan data lama pada browser dihapus.

## Hosting gratis (Render + Neon)

Konfigurasi [render.yaml](./render.yaml) menjalankan aplikasi dan backend Node.js sebagai satu layanan Render. PostgreSQL dihosting terpisah di Neon agar database tidak ikut terhapus saat layanan web Render tidur atau dimulai ulang. Fallback database sementara dinonaktifkan untuk hosting agar kegagalan koneksi database tidak menyebabkan data baru hilang saat aplikasi dimulai ulang.

Paket gratis cocok untuk uji coba atau proyek kecil, bukan layanan produksi dengan jaminan uptime atau backup. Render Free dapat tidur setelah 15 menit tanpa trafik sehingga kunjungan pertama berikutnya bisa lambat. Neon Free memiliki batas pemakaian dan kapasitas; periksa batas terbaru di dashboard masing-masing layanan.

1. Buat proyek PostgreSQL di Neon, lalu salin connection string pooled yang disediakan Neon. Jangan memasukkan connection string ke kode atau membagikannya.
2. Unggah seluruh folder proyek ke repository GitHub. Pastikan `server/.env` tidak ikut terunggah; file itu berisi rahasia dan sudah tercantum di `.gitignore`.
3. Buat akun Render, pilih **New > Blueprint**, lalu hubungkan repository. Render akan membaca `render.yaml` dan meminta nilai untuk `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, dan `GROQ_API_KEY`. Isi langsung di Render; gunakan connection string Neon, nama admin pilihan, password unik minimal 12 karakter, dan API key Groq bila memakai fitur AI. Jangan kirim nilai rahasia melalui chat.
4. `AUTH_TOKEN_SECRET` dibuat otomatis oleh konfigurasi Render. Setelah layanan berhasil deploy, buka URL `.onrender.com` yang ditampilkan Render dan uji login serta pendaftaran akun.
5. Tabel database dibuat otomatis saat backend pertama kali berjalan. Database Neon baru masih kosong: akun dan data yang sebelumnya hanya ada di PostgreSQL lokal **tidak** berpindah otomatis. Ekspor dan impor database lama perlu dilakukan secara terpisah sebelum mengandalkan hosting baru.
