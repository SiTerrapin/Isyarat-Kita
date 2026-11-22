# Isyarat Kita — Backend REST API

Backend REST API untuk aplikasi mobile **Isyarat Kita** (*Asisten Komunikasi Dua Arah BISINDO & Peringatan Suara Darurat untuk Teman Tuli*), dibangun menggunakan **FastAPI**, **SQLAlchemy**, **PostgreSQL 16 (Docker)**, dan arsitektur **Guest Mode (Lazy Registration)**.

---

## 1. Prasyarat (Prerequisites)

Pastikan perangkat Anda sudah terinstal:
- **Python 3.10+** (disarankan Python 3.11 – 3.13)
- **Docker Desktop** (pastikan sudah berjalan sebelum menyalakan database)
- **Git**

---

## 2. Alur Setup dari Nol (Step-by-Step)

### Langkah 1: Clone Repository & Masuk ke Folder `backend/`
```bash
git clone <URL_REPOSITORY_GITHUB>
cd "Isyarat Kita/backend"
```

### Langkah 2: Buat & Aktifkan Virtual Environment (`venv`)

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```
*(Jika muncul error ExecutionPolicy di PowerShell, jalankan sekali: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`)*

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Langkah 3: Instal Seluruh Library Python
```bash
pip install -r requirements.txt
```

### Langkah 4: Salin File Konfigurasi `.env`

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Linux / macOS:**
```bash
cp .env.example .env
```
*(Secara default `.env.example` sudah siap pakai untuk development lokal dengan port PostgreSQL `15432` dan `AI_MOCK_MODE=true`.)*

### Langkah 5: Nyalakan PostgreSQL via Docker
```bash
docker compose up -d
```
Cek apakah container `isyarat_kita_db` sudah berstatus **Up / healthy**:
```bash
docker ps
```

### Langkah 6: Jalankan Migrasi & Seeder Database
Saat volume Docker dibuat pertama kali, skema dan kartu bawaan otomatis diinisialisasi. Namun untuk memastikan seluruh migrasi terbaru dan data seed terpasang dengan benar, jalankan:

```bash
# Jalankan migrasi yang belum diterapkan
python scripts/migrate.py

# Jalankan seed kartu layanan publik bawaan sistem (8 kartu)
python scripts/seed.py
```

**Opsi Tambahan untuk Development:**
- **Buat Akun Demo + Contoh Data** (2 kartu kustom, 3 riwayat terjemahan, 2 log suara darurat):
  ```bash
  python scripts/seed.py --demo
  ```
- **Reset Total Database dari Awal** *(hapus seluruh tabel & migrasi ulang)*:
  ```bash
  python scripts/migrate.py --fresh
  python scripts/seed.py --demo
  ```

### Langkah 7: Jalankan Server FastAPI
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Server akan berjalan di `http://localhost:8000`.

---

## 3. Cara Verifikasi & Akses API

### Cek Health & Dokumentasi Interaktif (Swagger UI)
- **Health Check:** Buka [http://localhost:8000/health](http://localhost:8000/health)
  Respon sukses:
  ```json
  {
    "status": "ok",
    "database": "connected",
    "ai_mode": "mock",
    "model_loaded": false
  }
  ```
- **Swagger UI (Tes Endpoint Langsung):** Buka [http://localhost:8000/docs](http://localhost:8000/docs)

### Kredensial Akun Demo (Hasil `seed.py --demo`)
| Field | Nilai |
| :--- | :--- |
| **Email** | `demo@isyaratkita.id` |
| **Password** | `demo1234` |

### Info Koneksi Database (DBeaver / pgAdmin)
| Parameter | Nilai |
| :--- | :--- |
| **Host** | `localhost` |
| **Port** | `15432` |
| **Database** | `isyarat_kita` |
| **Username** | `postgres` |
| **Password** | `password123` |

### Menghubungkan dari Aplikasi Mobile Expo (HP Fisik)
1. Pastikan **HP dan laptop berada di jaringan Wi-Fi yang sama**.
2. Cek IP lokal laptop:
   - **Windows:** jalankan `ipconfig` → lihat `IPv4 Address` pada adapter Wi-Fi (contoh: `192.168.1.15`).
   - **Linux / macOS:** jalankan `ifconfig` atau `ip addr` → lihat alamat IP Wi-Fi.
3. Di aplikasi mobile **Isyarat Kita**, buka menu **Settings (ikon gerigi)** → masukkan `http://<IP-LAPTOP>:8000` → tekan **Simpan & Tes Koneksi (/health)**.

---

## 4. Panduan Kolaborasi & Troubleshooting Umum

### Setelah `git pull` dari GitHub
Setiap kali ada pembaruan dari rekan tim, jalankan perintah berikut di folder `backend/` (pastikan `venv` aktif):
```bash
pip install -r requirements.txt
python scripts/migrate.py
python scripts/seed.py
```
Seluruh migrasi dan seeder bersifat **idempotent**, sehingga aman dijalankan berulang kali tanpa menduplikasi data.

### Troubleshooting

1. **Port Docker Bentrok di Windows (`Ports are not available` / `excludedportrange`)**
   - Windows Hyper-V / WinNAT sering memblokir port `5432` atau `5433`. Proyek ini secara default sudah memakai port **`15432`**.
   - Jika port `15432` masih bentrok, buka `backend/.env` dan ubah `DB_PORT` serta `DATABASE_URL` ke port lain (misalnya `25432`), lalu jalankan ulang `docker compose up -d`.

2. **HP Tidak Bisa Mengakses `http://<IP-LAPTOP>:8000`**
   - Pastikan server dijalankan dengan `--host 0.0.0.0` (bukan `127.0.0.1`).
   - Izinkan port `8000` di Windows Defender Firewall, atau gunakan tunnel publik sementara dengan `ngrok http 8000` lalu masukkan URL `https://...ngrok-free.app` ke Settings aplikasi mobile.

3. **Mengaktifkan Model PyTorch BISINDO Asli (`GatedMultimodalSignModel` + MediaPipe)**
   - Pastikan seluruh dependensi AI sudah terinstal (`pip install -r requirements.txt` sudah mencakup `torch`, `torchvision`, `mediapipe`, `opencv-python-headless`, `rapidfuzz`, `Sastrawi`, `faster-whisper`, dan `edge-tts`).
   - Salin file model berikut ke folder `backend/models/`:
     - `backend/models/bisindo_convnext_tiny_gated_FINAL.pth` (wajib untuk mode model)
     - `backend/models/bisindo_gloss_conversation_dataset.jsonl` (opsional, untuk pencocokan kalimat natural)
   - Unduh file resmi MediaPipe `hand_landmarker.task` (atau biarkan terunduh otomatis saat startup pertama):
     ```bash
     python scripts/download_hand_landmarker.py
     ```
   - Ubah `AI_MOCK_MODE=false` di `backend/.env` lalu restart Uvicorn. Cek `GET /health` hingga tampil `"ai_mode": "model", "model_loaded": true`.
