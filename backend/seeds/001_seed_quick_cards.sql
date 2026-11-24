-- ============================================================================
-- Seed 001: 8 Kartu Layanan Publik Bawaan Sistem (user_id = NULL)
-- Idempotent: aman dijalankan berulang kali tanpa duplikasi.
-- ============================================================================

INSERT INTO quick_cards (user_id, category, title, message, is_pinned) VALUES
(
    NULL,
    'umum',
    'Perkenalan Teman Tuli',
    'Halo, saya Teman Tuli. Mohon berbicara perlahan sambil menghadap saya, atau ketik balasan Anda di aplikasi ini.',
    TRUE
),
(
    NULL,
    'darurat',
    'Butuh Bantuan Darurat',
    'Tolong! Saya dalam keadaan darurat dan membutuhkan bantuan segera. Mohon bantu saya menghubungi petugas terdekat.',
    TRUE
),
(
    NULL,
    'darurat',
    'Tersesat / Cari Arah',
    'Permisi, saya sedang tersesat. Mohon bantu tunjukkan arah atau ketik lokasi tempat ini di ponsel saya.',
    FALSE
),
(
    NULL,
    'kesehatan',
    'Antre di Rumah Sakit',
    'Permisi, saya ingin mendaftar pemeriksaan. Mohon panggil saya dengan melambaikan tangan karena saya tidak dapat mendengar panggilan suara.',
    FALSE
),
(
    NULL,
    'kesehatan',
    'Tebus Obat di Apotek',
    'Permisi, saya ingin menebus resep obat ini. Mohon tuliskan aturan pakai dan dosisnya dengan jelas di kertas atau layar ini.',
    FALSE
),
(
    NULL,
    'transportasi',
    'Tanya Rute / Turun',
    'Permisi, apakah kendaraan ini melewati tujuan saya? Mohon beri tahu saya dengan isyarat tangan saat sudah dekat.',
    FALSE
),
(
    NULL,
    'transaksi',
    'Tanya Harga',
    'Permisi, berapa total harga belanjaan saya? Mohon tunjukkan angkanya di kalkulator atau layar kasir.',
    FALSE
),
(
    NULL,
    'transaksi',
    'Pembayaran Non-Tunai (QRIS)',
    'Permisi, apakah saya bisa membayar menggunakan QRIS atau kartu debit? Mohon arahkan saya ke kode QR-nya.',
    FALSE
)
ON CONFLICT (category, title) WHERE user_id IS NULL DO NOTHING;
