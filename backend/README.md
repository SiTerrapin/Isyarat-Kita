---
title: Isyarat Kita API
emoji: 🤟
colorFrom: teal
colorTo: green
sdk: docker
app_port: 8000
pinned: false
---

# Isyarat Kita — Backend API

Backend REST API berbasis **FastAPI** untuk aplikasi **Isyarat Kita** (Penerjemah Bahasa Isyarat BISINDO dua arah, Hybrid NLP + Chat AI, STT/TTS, dan Sound Alert untuk Teman Tuli).

## Fitur Utama
- **Vision BISINDO (`POST /api/predict-sign`)**: `GatedMultimodalSignModel` (ConvNeXt-Tiny + MediaPipe HandLandmarker 156-dim).
- **Hybrid NLP & Chat AI (`POST /api/correct-word`, `POST /api/refine-text`, `POST /api/chat-ai`)**: Gemini 2.5 Flash dengan *auto-fallback* lokal (Sastrawi + RapidFuzz + dataset JSONL).
- **Audio & Sound Alert (`POST /api/stt`, `POST /api/tts`, `POST /api/classify-sound`)**: `faster-whisper`, `edge-tts`/`gTTS`, dan klasifikasi suara darurat AudioSet.
- **Database Cloud PostgreSQL**: Mendukung Neon / Supabase (`DATABASE_URL` dengan `sslmode=require`) dan *auto-create* seluruh tabel saat startup.
- **Health Check**: `GET /`, `GET /health`, dan `GET /api/health`.

## Konfigurasi Secrets (Hugging Face Spaces)
Tambahkan variabel berikut di **Settings → Variables and secrets**:
- `DATABASE_URL` (Secret): Connection string PostgreSQL Neon/Supabase (`postgresql://...?sslmode=require`)
- `SECRET_KEY` (Secret): String acak panjang untuk JWT
- `GEMINI_API_KEY` (Secret): API key Gemini 2.5 Flash
- `AI_MOCK_MODE` (Variable): `false`
- `GEMINI_MODEL` (Variable, opsional): `gemini-2.5-flash`
- `STT_MODEL_SIZE` (Variable, opsional): `tiny`
