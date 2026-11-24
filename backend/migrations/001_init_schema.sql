-- ============================================================================
-- Migration 001: Inisialisasi Skema Database Isyarat Kita
-- Mendukung Guest Mode (Lazy Registration) & Komunikasi Dua Arah BISINDO
-- ============================================================================

-- 0. Tabel Pelacak Migrasi
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. Tabel Pengguna (Untuk Login/Register saat user ingin menyimpan data)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Kartu Layanan Publik (Quick Cards)
-- user_id = NULL  -> Kartu bawaan sistem (tampil untuk semua Guest & User Login)
-- user_id = terisi -> Kartu kustom milik user tertentu
CREATE TABLE IF NOT EXISTS quick_cards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL CHECK (category IN ('darurat', 'kesehatan', 'transportasi', 'transaksi', 'umum')),
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index agar seed kartu bawaan sistem tidak pernah duplikat
CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_cards_system
    ON quick_cards (category, title)
    WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_quick_cards_user_id
    ON quick_cards (user_id);

CREATE INDEX IF NOT EXISTS idx_quick_cards_pinned_created
    ON quick_cards (is_pinned DESC, created_at DESC);

-- 3. Tabel Riwayat Komunikasi Dua Arah (Translation Logs)
CREATE TABLE IF NOT EXISTS translation_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('sign_to_text', 'speech_to_text')),
    raw_gloss TEXT,
    final_text TEXT NOT NULL,
    confidence REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_translation_logs_user_created
    ON translation_logs (user_id, created_at DESC);

-- 4. Tabel Log Peringatan Suara Lingkungan (Sound Alerts)
CREATE TABLE IF NOT EXISTS sound_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sound_type VARCHAR(50) NOT NULL,
    decibel_level REAL NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'danger')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sound_alerts_user_created
    ON sound_alerts (user_id, created_at DESC);

-- 5. Tabel Pengaturan Pengguna (1 user = 1 baris pengaturan)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    alert_threshold_db INTEGER DEFAULT 75,
    tts_speech_rate REAL DEFAULT 1.0,
    auto_detect_sign BOOLEAN DEFAULT TRUE,
    haptic_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Catat migrasi ini ke tabel pelacak
INSERT INTO schema_migrations (version)
VALUES ('001_init_schema.sql')
ON CONFLICT (version) DO NOTHING;
