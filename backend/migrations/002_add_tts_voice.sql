-- ============================================================================
-- Migration 002: Tambahkan kolom tts_voice pada tabel user_settings
-- Mendukung Multi-Voice TTS: ROLEPLAY, id-ID-ArdiNeural, id-ID-GadisNeural, gtts, device
-- ============================================================================

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS tts_voice VARCHAR(50) NOT NULL DEFAULT 'id-ID-ArdiNeural';

INSERT INTO schema_migrations (version)
VALUES ('002_add_tts_voice.sql')
ON CONFLICT (version) DO NOTHING;
