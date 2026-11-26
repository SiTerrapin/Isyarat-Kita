# 🤟 Isyarat Kita

**Isyarat Kita** adalah aplikasi asisten komunikasi inklusif dua arah berbasis kecerdasan buatan (AI) untuk **Teman Tuli** dan masyarakat umum. Aplikasi ini menerjemahkan **Bahasa Isyarat Indonesia (BISINDO)** secara *real-time* dari kamera menjadi teks natural dan suara (Text-to-Speech), mendukung obrolan dua arah (**Chat AI** & **Speech-to-Text**), serta dilengkapi fitur **Peringatan Suara Darurat (Sound Alert)** berbasis audio AI dan getaran perangkat.

---

## 1. Tech Stack & Arsitektur

| Lapisan | Teknologi | Peran Utama |
| :--- | :--- | :--- |
| **Backend API** | **FastAPI** (Python 3.11+), Uvicorn | REST API inferensi AI, autentikasi JWT, manajemen kartu & riwayat |
| **Vision AI (BISINDO)** | **PyTorch** (`ConvNeXt-Tiny` *Gated Multimodal*) + **MediaPipe** (`HandLandmarker` 156-dim) | Deteksi landmark tangan & klasifikasi abjad BISINDO dengan filter anti-*false-positive* |
| **Hybrid NLP & Chat AI** | **Google Gemini (`gemini-2.5-flash`)** + **Sastrawi** & **RapidFuzz** | Pemisahan & koreksi ejaan jari menjadi kalimat natural + balasan Chat AI (dengan *offline fallback* JSONL) |
| **Audio AI (STT, TTS, Alert)** | **faster-whisper**, **edge-tts** / **gTTS**, **AudioSet AST** (`MIT/ast-finetuned-audioset`) + analisis spektral | Transkripsi suara ke teks, Multi-Voice TTS Bahasa Indonesia, dan deteksi suara darurat (klakson, sirene, alarm, bel) |
| **Database** | **PostgreSQL 16** (SQLAlchemy + `psycopg2-binary`) | **Auto-Fallback DB**: prioritas PostgreSQL lokal (Docker), otomatis *fallback* ke PostgreSQL Cloud (**Neon**) jika lokal tidak aktif |
| **Mobile App** | **React Native (Expo SDK 58)**, Expo Router, TypeScript, NativeWind v4, **`react-native-vision-camera`**, `expo-audio` | Aplikasi Android/iOS dengan kamera *live stream* native tanpa *shutter lag* |
| **Arsitektur Koneksi** | **Dynamic Cloudflare Tunnel** + **Render Router** (`https://isyarat-kita.onrender.com`) | Backend AI berjalan cepat di PC/server lokal via Cloudflare Tunnel, URL aktif otomatis disinkronkan ke Render Router sehingga **APK tidak perlu di-build ulang** saat link tunnel berganti |

### Alur Koneksi Dinamis
```text
[PC Backend Lokal: FastAPI :8000]
        │
        ▼ (cloudflared via tunnel_sync.py)
[Cloudflare Quick Tunnel: https://xxxx.trycloudflare.com]
        │
        ▼ POST /update-url (otomatis + keep-alive tiap 10 menit)
[Render Router: https://isyarat-kita.onrender.com]
        ▲
        │ GET /get-url (otomatis saat buka app / auto-retry saat link berubah)
[Mobile App APK: Isyarat Kita]
```

---

## 2. Daftar Menu & Fitur Utama

Aplikasi memiliki **4 tab navigasi utama** serta **1 layar modal Pengaturan**:

| Menu / Halaman | File Rute | Fungsi Utama |
| :--- | :--- | :--- |
| **Beranda** | `mobile-app/app/(tabs)/index.tsx` | Dashboard utama, indikator status koneksi backend/AI/DB (`/health`), pintasan cepat ke fitur utama, dan ringkasan riwayat terjemahan terbaru. |
| **Translator** | `mobile-app/app/(tabs)/translator.tsx` | **Mode 1 (Isyarat → Suara & Teks):** Kamera native `react-native-vision-camera` (front/back, Pause/Resume, border hijau saat tangan terdeteksi), *stability buffer* 3 frame, koreksi kata otomatis, tombol *Rangkai & Ucapkan*, **Toggle Chat AI** (balasan dua arah + TTS), dan tampilan Layar Penuh.<br>**Mode 2 (Suara ↔ Teks / Chat):** Percakapan dua arah bergantian (*Saya* vs *Lawan Bicara*) dengan rekam suara STT (`faster-whisper`) dan *Auto-Speak* TTS. |
| **Suara Darurat** | `mobile-app/app/(tabs)/alert.tsx` | Deteksi cepat tanggap suara sekitar (klakson kendaraan, sirene/alarm darurat, ketukan/bel rumah, suara berbahaya) dengan 3 mode sensitivitas (*Tenang*, *Normal*, *Ramai*), filter anti-gesekan mikrofon, notifikasi visual kontras, dan getaran perangkat (`Vibration`). |
| **Kartu Cepat** | `mobile-app/app/(tabs)/cards.tsx` | Kumpulan kartu frasa komunikasi siap pakai berkategori (*Darurat*, *Kesehatan*, *Transportasi*, *Transaksi*, *Umum*) dengan fitur *pin*, kartu kustom (CRUD), *offline fallback*, tampilan layar penuh, dan baca suara TTS. |
| **Pengaturan** *(Modal)* | `mobile-app/app/settings.tsx` | Pengaturan tema (*Terang* / *Gelap* / *Sistem*), konfigurasi URL Backend (**Auto Render Router** atau **Manual Override** + tombol *Simpan & Tes `/health`*), pilihan 5 karakter suara Multi-Voice TTS & kecepatan bicara, pengaturan getaran, serta manajemen akun (*Mode Tamu* / *Login* / *Daftar*). |

---

## 3. Struktur File & Folder

```text
Isyarat Kita/
├── README.md                                 # Dokumentasi utama proyek
├── LICENSE                                   # Lisensi proyek (MIT)
├── .gitignore                                # Aturan pengecualian Git (termasuk .env & model .pth)
│
├── backend/                                  # Server Backend FastAPI + AI Services
│   ├── start_isyarat_kita.bat                # Launcher 1-klik Windows (FastAPI + Cloudflare Tunnel Sync)
│   ├── tunnel_sync.py                        # Otomasi cloudflared + sinkronisasi URL & keep-alive ke Render Router
│   ├── run.bat                               # Launcher cepat Uvicorn lokal saja
│   ├── Dockerfile                            # Image Docker hemat RAM (CPU-only PyTorch, single worker)
│   ├── docker-compose.yml                    # Container PostgreSQL 16 lokal (port 15432)
│   ├── requirements.txt                      # Daftar dependensi Python
│   ├── .env.example                          # Template variabel environment (tanpa kredensial asli)
│   ├── app/
│   │   ├── main.py                           # Entrypoint FastAPI, CORS, lifespan init_db(), GET /health
│   │   ├── core/
│   │   │   ├── config.py                     # Pembacaan .env (DB lokal/deploy, AI_MODEL_URL, GEMINI_API_KEY)
│   │   │   └── security.py                   # Hashing password (bcrypt) & JWT authentication
│   │   ├── db/
│   │   │   ├── database.py                   # Auto-Fallback DB (Lokal -> Neon Cloud) & auto-create tabel
│   │   │   └── models.py                     # Model ORM SQLAlchemy (users, quick_cards, logs, alerts, settings)
│   │   ├── routers/
│   │   │   ├── ai.py                         # /api/predict-sign, /api/correct-word, /api/refine-text, /api/chat-ai
│   │   │   ├── speech.py                     # /api/stt, /api/tts, /api/classify-sound
│   │   │   ├── auth.py                       # /api/auth/register, /api/auth/login, /api/auth/me
│   │   │   ├── cards.py                      # CRUD Kartu Cepat
│   │   │   ├── logs.py                       # Riwayat terjemahan
│   │   │   ├── alerts.py                     # Riwayat peringatan suara darurat
│   │   │   └── settings.py                   # Sinkronisasi pengaturan pengguna
│   │   ├── schemas/                          # Skema validasi Pydantic (ai, auth, cards, logs, alerts, settings)
│   │   └── services/
│   │       ├── vision_service.py             # Pipeline BISINDO (MediaPipe + ROI filter + ConvNeXt-Tiny + auto-download)
│   │       ├── nlp_service.py                # Hybrid NLP (Gemini 2.5 Flash + Sastrawi/RapidFuzz + Chat AI)
│   │       ├── audio_service.py              # Klasifikasi suara darurat AudioSet AST + filter anti-gesekan mic
│   │       └── sound_service.py              # Helper pemrosesan audio & TTS/STT
│   ├── migrations/                           # Skrip migrasi SQL PostgreSQL
│   ├── seeds/                                # Data awal kartu komunikasi cepat
│   ├── scripts/                              # Utilitas migrasi, seeder, dan unduh aset model
│   └── models/                               # Direktori bobot AI (.pth, .task, dataset .jsonl)
│
└── mobile-app/                               # Aplikasi Mobile React Native (Expo Router)
    ├── app.json                              # Konfigurasi Expo, izin kamera/mikrofon/getar, plugin VisionCamera
    ├── eas.json                              # Profil EAS Build (preview APK & production)
    ├── package.json                          # Dependensi & skrip Expo
    ├── start-expo.ps1                        # Skrip helper menjalankan Metro Expo di Windows
    ├── app/
    │   ├── _layout.tsx                       # Root Stack Navigator + AppProvider + AuthModal
    │   ├── settings.tsx                      # Modal Pengaturan (Tema, Server URL, Multi-Voice TTS, Akun)
    │   └── (tabs)/
    │       ├── _layout.tsx                   # Konfigurasi 4 Bottom Tabs
    │       ├── index.tsx                     # Halaman Beranda
    │       ├── translator.tsx                # Halaman Kamera AI BISINDO (VisionCamera) & Chat Suara↔Teks
    │       ├── alert.tsx                     # Halaman Pemantauan Suara Darurat (Sound Alert)
    │       └── cards.tsx                     # Halaman Kartu Komunikasi Cepat
    ├── components/
    │   └── AuthModal.tsx                     # Modal Login & Registrasi akun
    ├── context/
    │   └── AppContext.tsx                    # State global (serverUrl dinamis, auth, kartu, riwayat, tema)
    ├── hooks/
    │   └── useTTS.ts                         # Hook Multi-Voice TTS terpusat (Edge TTS, gTTS, Expo Speech offline)
    └── services/
        ├── apiConfig.ts                      # Resolusi URL prioritas (Manual -> Cache -> Render Router /get-url)
        └── api.ts                            # HTTP & upload client dengan Auto-Refresh & Retry 1x saat tunnel berubah
```

---

## 4. Prasyarat (Prerequisites)

Pastikan perangkat Anda sudah memiliki software berikut:

- **Python 3.11+** (disarankan 3.11 – 3.13) & `pip`
- **Node.js 18+ (LTS)** & `npm`
- **Cloudflare Tunnel (`cloudflared`)** terinstal di `PATH` (diperlukan untuk mode *Dynamic Tunnel* via `tunnel_sync.py`)
- **Docker Desktop / PostgreSQL 16** *(opsional)* — jika PostgreSQL lokal tidak dijalankan, backend otomatis terhubung ke database cloud Neon yang dikonfigurasi di `DATABASE_URL_DEPLOY`
- **Android Studio / EAS CLI** *(opsional, untuk build Development Build / APK Android karena menggunakan modul native `react-native-vision-camera`)*

---

## 5. Cara Instalasi

### A. Clone Repository
```bash
git clone https://github.com/SiTerrapin/Isyarat-Kita.git
cd "Isyarat Kita"
```

### B. Setup Backend (`backend/`)
1. Buat *virtual environment* dan instal seluruh dependensi Python:
   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

2. Buat file `backend/.env` dari template `.env.example`, lalu sesuaikan nilainya (**jangan pernah meng-commit `.env` ke Git**):
   ```env
   # Auto-Fallback Database:
   # Prioritas 1: PostgreSQL Lokal (Docker port 15432)
   # Prioritas 2 (otomatis jika lokal mati): PostgreSQL Cloud (Neon / Supabase)
   DATABASE_URL_LOCAL=postgresql://user:password@localhost:15432/isyarat_kita
   DATABASE_URL_DEPLOY=postgresql://user:password@ep-example-pooler.region.aws.neon.tech/isyarat_kita_db?sslmode=require&channel_binding=require

   # JWT Authentication
   SECRET_KEY=ganti-dengan-secret-key-acak-minimal-32-karakter
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=10080

   # Model AI BISINDO (otomatis diunduh jika AI_MODEL_URL diisi)
   AI_MOCK_MODE=false
   AI_MODEL_PATH=models/bisindo_convnext_tiny_gated_FINAL.pth
   AI_MODEL_URL=https://github.com/SiTerrapin/Isyarat-Kita/releases/download/v.03-model-BISINDO/bisindo_convnext_tiny_gated_FINAL.pth
   HAND_LANDMARKER_PATH=models/hand_landmarker.task
   GLOSS_DATASET_PATH=models/bisindo_gloss_conversation_dataset.jsonl

   # Speech-to-Text & Hybrid NLP / Chat AI
   STT_MODEL_SIZE=tiny
   GEMINI_API_KEY=masukkan-api-key-gemini-anda
   GEMINI_MODEL=gemini-2.5-flash
   ```

3. *(Opsional)* Jika ingin menjalankan PostgreSQL lokal menggunakan Docker:
   ```powershell
   docker compose up -d
   ```
   > Jika Docker tidak dijalankan, backend akan otomatis beralih ke `DATABASE_URL_DEPLOY` (Neon Cloud) dan membuat seluruh tabel secara otomatis saat startup.

### C. Setup Mobile App (`mobile-app/`)
```powershell
cd ..\mobile-app
npm install
```

---

## 6. Cara Menjalankan (Running)

### Opsi 1: Mode Demo / Sekali Klik (Windows — Direkomendasikan)
Jalankan file **[backend/start_isyarat_kita.bat](backend/start_isyarat_kita.bat)** (klik dua kali atau lewat terminal):
```powershell
cd backend
.\start_isyarat_kita.bat
```
Skrip ini otomatis membuka dua jendela CMD:
1. **Backend FastAPI:** Mengaktifkan `venv` dan menjalankan `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
2. **Cloudflare Tunnel Sync:** Menjalankan `python tunnel_sync.py` yang membuat Cloudflare Tunnel ke `http://127.0.0.1:8000`, mendeteksi URL `https://xxxx.trycloudflare.com`, langsung menyinkronkannya ke Render Router (`https://isyarat-kita.onrender.com/update-url`), serta mengirim *keep-alive* setiap 10 menit.

> Setelah muncul log `[SYNC] Berhasil kirim ke Render (HTTP 200)`, aplikasi APK di HP bisa langsung digunakan dari jaringan mana pun (Wi-Fi maupun data seluler) tanpa ubah kode atau build ulang.

### Opsi 2: Mode Manual / Development Lokal
1. **Jalankan Backend FastAPI secara manual:**
   ```powershell
   cd backend
   .\venv\Scripts\activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
   ```
   - Backend otomatis memilih PostgreSQL lokal (`DATABASE_URL_LOCAL`) bila aktif, atau *fallback* ke Neon Cloud (`DATABASE_URL_DEPLOY`) bila lokal mati.
   - Cek status server di `http://127.0.0.1:8000/health` — pastikan `status: "ok"`, `ai_mode: "model"`, dan `model_loaded: true`.

2. **Jalankan Mobile App (Expo):**
   ```powershell
   cd mobile-app
   npx expo start
   ```
   *(Untuk build APK preview Android yang memuat `react-native-vision-camera`, jalankan `eas build -p android --profile preview`.)*

### Konfigurasi URL Server di Aplikasi Mobile
Aplikasi menggunakan sistem prioritas URL di `mobile-app/services/apiConfig.ts`:
1. **Mode Otomatis (Default APK):** Saat dibuka, aplikasi otomatis memanggil `GET https://isyarat-kita.onrender.com/get-url` untuk mengambil link Cloudflare Tunnel terbaru. Jika link tunnel berubah di tengah penggunaan (error jaringan / 502 / 503 / 504), aplikasi otomatis mengambil ulang URL baru dan me-*retry* permintaan 1 kali.
2. **Mode Manual Override (Cadangan / Wi-Fi Lokal):** Buka menu **Pengaturan (ikon gerigi)** → masukkan IP lokal (contoh: `http://192.168.1.6:8000`) atau link `trycloudflare.com` secara manual → tekan **Simpan & Tes (`/health`)**. Untuk kembali ke mode otomatis kapan saja, tekan tombol **Auto Router**.

---

## Lisensi
Didistribusikan di bawah lisensi MIT. Lihat file [LICENSE](LICENSE) untuk informasi lengkap.
