# Isyarat Kita

> **"Menjembatani Sunyi, Menghubungkan Negeri."**

Aplikasi mobile asisten komunikasi dua arah **BISINDO (Bahasa Isyarat Indonesia)** dan **Peringatan Suara Darurat** untuk Teman Tuli, dilengkapi arsitektur **Guest Mode (Lazy Registration)** agar fitur utama dapat langsung digunakan tanpa login paksa.

---

## Struktur Proyek

```text
Isyarat Kita/
├── backend/                  # FastAPI + SQLAlchemy + PostgreSQL 16 (Docker) + AI BISINDO + STT/TTS
│   ├── app/                  # Router REST API, ORM Models, Vision, NLP, Speech (STT & Multi-Voice TTS)
│   ├── migrations/           # Migrasi SQL berurutan & idempotent (001, 002, ...)
│   ├── seeds/                # Seed kartu layanan publik bawaan sistem (8 kartu)
│   ├── scripts/              # migrate.py, seed.py, download_hand_landmarker.py
│   ├── models/               # Tempat file bobot .pth, hand_landmarker.task, dan dataset .jsonl
│   ├── docker-compose.yml    # Container PostgreSQL 16 (port default 15432)
│   ├── .env.example          # Template konfigurasi environment
│   └── requirements.txt      # Dependensi Python
└── mobile-app/               # React Native (Expo Router TypeScript + NativeWind v4)
    ├── app/                  # 4 Bottom Tabs (Beranda, Translator, Suara Darurat, Kartu Cepat) + Modal Settings
    ├── components/           # AuthModal (Lazy Registration)
    ├── context/              # AppContext (AsyncStorage, Auto-Detect IP, Guest Mode)
    ├── hooks/                # useTTS (Multi-Voice TTS terpusat + Indonesian offline fallback)
    ├── services/             # API Client + FileSystem.uploadAsync STT
    └── start-expo.ps1        # Launcher Expo anti-putus (LAN / USB / Tunnel)
```

---

## 1. Prasyarat (Prerequisites)

Pastikan perangkat Anda sudah terinstal:
- **Python 3.10+** (disarankan Python 3.11 – 3.13)
- **Node.js 18+ / 20+** & npm
- **Docker Desktop** (pastikan sudah menyala sebelum menjalankan database)
- **Git**
- Aplikasi **Expo Go** di HP Android / iOS (untuk pengujian di perangkat fisik)

---

## 2. Setup & Menjalankan Backend (`backend/`)

### Langkah 1: Clone Repository & Masuk ke Folder `backend/`
```bash
git clone https://github.com/SiTerrapin/Isyarat-Kita.git
cd "Isyarat-Kita/backend"
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

### Langkah 3: Instal Seluruh Dependensi Python
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
*(Default `.env.example` sudah siap pakai untuk development lokal dengan port PostgreSQL `15432` dan `AI_MOCK_MODE=true`.)*

### Langkah 5: Nyalakan PostgreSQL via Docker
```bash
docker compose up -d
docker ps
```
Pastikan container `isyarat_kita_db` berstatus **Up / healthy**.

### Langkah 6: Jalankan Migrasi & Seeder Database
```bash
# Terapkan seluruh migrasi SQL yang belum dijalankan
python scripts/migrate.py

# Isi 8 kartu layanan publik bawaan sistem (user_id = NULL)
python scripts/seed.py
```

**Opsi Development:**
- Buat akun demo (`demo@isyaratkita.id` / `demo1234`) + contoh kartu kustom, riwayat, & log suara:
  ```bash
  python scripts/seed.py --demo
  ```
- Reset total database dari awal *(drop semua tabel lalu migrasi ulang)*:
  ```bash
  python scripts/migrate.py --fresh
  python scripts/seed.py --demo
  ```

### Langkah 7: (Opsional) Mengaktifkan Model AI BISINDO Asli
Secara default `AI_MOCK_MODE=true` agar backend bisa langsung berjalan tanpa file bobot besar. Untuk mengaktifkan model PyTorch asli (`GatedMultimodalSignModel` + MediaPipe 156-dim):
1. Salin file model berikut ke folder `backend/models/`:
   - `backend/models/bisindo_convnext_tiny_gated_FINAL.pth` *(wajib untuk mode model)*
   - `backend/models/bisindo_gloss_conversation_dataset.jsonl` *(opsional, untuk pencocokan kalimat natural)*
2. Unduh file resmi MediaPipe `hand_landmarker.task` (atau biarkan terunduh otomatis saat startup pertama):
   ```bash
   python scripts/download_hand_landmarker.py
   ```
3. Ubah `AI_MOCK_MODE=false` di `backend/.env`.

### Langkah 8: Jalankan Server FastAPI
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Health Check:** [http://localhost:8000/health](http://localhost:8000/health)
- **Swagger UI (Dokumentasi API Interaktif):** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 3. Setup & Menjalankan Mobile App (`mobile-app/`)

### Langkah 1: Instal Dependensi Node.js
Buka terminal baru:
```bash
cd "Isyarat-Kita/mobile-app"
npm install
```

### Langkah 2: Jalankan Expo Metro Bundler

**Windows (Disarankan — Launcher Anti-Putus):**
- **Mode Wi-Fi / LAN** *(otomatis memilih IPv4 LAN fisik & mengabaikan adapter virtual WSL/Docker)*:
  ```powershell
  npm run start:lan
  ```
- **Mode Kabel USB** *(paling stabil, otomatis `adb reverse` port `8081` & `8000`)*:
  ```powershell
  npm run start:usb
  ```
- **Mode Tunnel** *(jika Wi-Fi kampus/kantor memakai AP Isolation)*:
  ```powershell
  npm run start:tunnel
  ```

**Linux / macOS atau standar:**
```bash
npx expo start -c
```

### Langkah 3: Hubungkan HP (Expo Go) ke Backend
1. Pastikan **HP dan laptop berada di jaringan Wi-Fi yang sama** (dan matikan sementara VPN seperti Cloudflare WARP).
2. Buka aplikasi **Expo Go** di HP → **Scan QR Code** dari terminal Expo.
3. Di aplikasi **Isyarat Kita**, IP server backend otomatis terdeteksi dari Expo Go (`http://<IP-LAPTOP>:8000`). Anda juga dapat menyesuaikannya kapan saja melalui menu **Settings (ikon gerigi)** → **Deteksi IP Otomatis** → **Simpan & Tes (/health)**.

---

## 4. Fitur Utama Aplikasi
1. **Beranda:** Status koneksi Server AI (`/health`), Mode Tamu / profil akun, pintasan cepat fitur utama, dan 5 riwayat komunikasi terakhir.
2. **Translator Dua Arah:**
   - **Mode 1 (`Isyarat → Suara & Teks`):** Kamera BISINDO (`GatedMultimodalSignModel` + MediaPipe 156-dim), buffer stabilitas huruf, auto-spasi koreksi kata (`Sastrawi` + `rapidfuzz`), perangkai kalimat natural, dan pemutaran suara Multi-Voice TTS.
   - **Mode 2 (`Suara ↔ Teks / Chat`):** Tampilan chat 1 perangkat bergantian bergaya WA/IG (Teman Tuli di kanan, Lawan Bicara di kiri), rekam suara lawan bicara → transkripsi `id-ID` (`POST /api/stt` via `faster-whisper` + `imageio-ffmpeg`), Auto-Speak, dan Layar Penuh di tiap bubble.
3. **Deteksi Suara Darurat:** Pemantauan level dB real-time (`expo-audio` metering), layar berkedip kontras tinggi kuning/merah, getaran darurat berpola (`expo-haptics`), dan log peringatan suara.
4. **Kartu Komunikasi Cepat (Quick Cards):** 8 kartu layanan publik bawaan (tersedia fallback offline), Fullscreen Communication Modal dengan suara terpusat (`useTTS`), serta tambah/edit/hapus kartu kustom untuk pengguna yang login.
5. **Multi-Voice TTS (5 Pilihan di Settings):**
   - `ROLEPLAY` — Duet Otomatis (*Mas Ardi* untuk Saya/Isyarat, *Mbak Gadis* untuk Lawan Bicara)
   - `id-ID-ArdiNeural` — Mas Ardi (Edge TTS)
   - `id-ID-GadisNeural` — Mbak Gadis (Edge TTS)
   - `gtts` — Google Standar (`gTTS`)
   - `device` — Suara Bawaan HP Offline (`expo-speech` Bahasa Indonesia)

---

## 5. Info Akun Demo & Database (DBeaver / pgAdmin)

### Akun Demo (Hasil `python scripts/seed.py --demo`)
| Field | Nilai |
| :--- | :--- |
| **Email** | `demo@isyaratkita.id` |
| **Password** | `demo1234` |

### Koneksi PostgreSQL
| Parameter | Nilai |
| :--- | :--- |
| **Host** | `localhost` |
| **Port** | `15432` |
| **Database** | `isyarat_kita` |
| **Username** | `postgres` |
| **Password** | `password123` |

---

## 6. Kolaborasi Tim & Troubleshooting

### Setelah `git pull` dari GitHub
```bash
# Di folder backend/ (venv aktif)
pip install -r requirements.txt
python scripts/migrate.py
python scripts/seed.py

# Di folder mobile-app/
npm install
```

### Troubleshooting Umum di Windows
1. **HP Tidak Bisa Terhubung ke Port `8000` / `8081` (Windows Firewall):**
   Buka **PowerShell sebagai Administrator** lalu jalankan sekali:
   ```powershell
   New-NetFirewallRule -DisplayName "Isyarat Kita - FastAPI (8000)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any
   New-NetFirewallRule -DisplayName "Isyarat Kita - Expo Metro (8081)" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Any
   ```
   Pastikan juga profil Wi-Fi/Ethernet di Windows disetel ke **Private** dan matikan sementara VPN (seperti Cloudflare WARP).
2. **Port Docker Bentrok (`Ports are not available` / `excludedportrange`):**
   Ubah `DB_PORT` dan `DATABASE_URL` di `backend/.env` ke port lain (misalnya `25432`), lalu jalankan `docker compose up -d`.
