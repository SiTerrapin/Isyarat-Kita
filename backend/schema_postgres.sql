-- 1. Tabel Pengguna (Untuk Login/Register saat mau simpan data)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Kartu Layanan Publik
-- user_id = NULL artinya kartu bawaan sistem (tampil untuk semua Guest & User)
-- user_id = terisi artinya kartu kustom buatan user tertentu
CREATE TABLE IF NOT EXISTS quick_cards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL CHECK (category IN ('darurat', 'kesehatan', 'transportasi', 'transaksi', 'umum')),
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Riwayat Komunikasi Dua Arah (Hanya tersimpan jika user login)
CREATE TABLE IF NOT EXISTS translation_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('sign_to_text', 'speech_to_text')),
    raw_gloss TEXT,
    final_text TEXT NOT NULL,
    confidence REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabel Log Peringatan Suara Lingkungan
CREATE TABLE IF NOT EXISTS sound_alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sound_type VARCHAR(50) NOT NULL,
    decibel_level REAL NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'danger')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Pengaturan Pengguna (1 user = 1 baris pengaturan)
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    alert_threshold_db INTEGER DEFAULT 75,
    tts_speech_rate REAL DEFAULT 1.0,
    auto_detect_sign BOOLEAN DEFAULT TRUE,
    haptic_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SEED DATA: Kartu Bawaan Sistem (user_id = NULL)
-- ==========================================
INSERT INTO quick_cards (user_id, category, title, message, is_pinned) VALUES
(NULL, 'umum', 'Perkenalan Tuli', 'Halo, saya Teman Tuli. Mohon berbicara perlahan menghadap saya atau gunakan aplikasi ini untuk membalas.', TRUE),
(NULL, 'darurat', 'Butuh Bantuan Darurat', 'Tolong! Saya dalam keadaan darurat dan membutuhkan bantuan segera.', TRUE),
(NULL, 'kesehatan', 'Antre di Rumah Sakit', 'Permisi, saya ingin mendaftar pemeriksaan. Mohon panggil saya dengan melambaikan tangan karena saya tidak bisa mendengar panggilan suara.', FALSE),
(NULL, 'transportasi', 'Tanya Rute / Turun', 'Permisi, apakah kendaraan ini melewati tujuan saya? Mohon beri tahu saat sudah dekat.', FALSE),
(NULL, 'transaksi', 'Tanya Harga', 'Permisi, berapa total harga belanjaan saya? Mohon tunjukkan angkanya.', FALSE)
ON CONFLICT DO NOTHING;