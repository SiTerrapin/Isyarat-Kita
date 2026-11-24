#!/usr/bin/env python3
"""
Database Seeder untuk Isyarat Kita.

Penggunaan:
    python scripts/seed.py         # Jalankan seluruh seed SQL bawaan sistem
    python scripts/seed.py --demo  # Jalankan seed SQL + buat akun demo & contoh data
"""

import argparse
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SEEDS_DIR = BASE_DIR / "seeds"
ENV_FILE = BASE_DIR / ".env"
DEFAULT_DATABASE_URL = "postgresql://postgres:password123@localhost:15432/isyarat_kita"

# Tambahkan folder backend/ ke sys.path agar bisa memakai hash password yang sama dengan app.core.security
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

try:
    from dotenv import load_dotenv
except ImportError:
    print(
        "[ERROR] Library 'python-dotenv' belum terinstal. "
        "Aktifkan venv lalu jalankan: pip install -r requirements.txt"
    )
    sys.exit(1)

try:
    import psycopg2
except ImportError:
    print(
        "[ERROR] Library 'psycopg2-binary' belum terinstal. "
        "Aktifkan venv lalu jalankan: pip install -r requirements.txt"
    )
    sys.exit(1)


def get_database_url() -> str:
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
    raw_url = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL).strip()
    if raw_url.startswith("postgresql+psycopg2://"):
        raw_url = raw_url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return raw_url


def hash_demo_password(password: str) -> str:
    """Gunakan fungsi hash yang sama persis dengan auth backend (passlib[bcrypt])."""
    try:
        from app.core.security import get_password_hash

        return get_password_hash(password)
    except Exception:
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.hash(password)


def seed_demo_data(cursor) -> None:
    demo_email = "demo@isyaratkita.id"
    demo_password = "demo1234"
    demo_name = "Pengguna Demo Isyarat Kita"

    print(f"[DEMO] Menyiapkan akun demo ({demo_email})...")
    password_hash = hash_demo_password(demo_password)

    cursor.execute(
        """
        INSERT INTO users (full_name, email, password_hash)
        VALUES (%s, %s, %s)
        ON CONFLICT (email) DO NOTHING
        RETURNING id;
        """,
        (demo_name, demo_email, password_hash),
    )
    row = cursor.fetchone()
    if row is not None:
        demo_user_id = row[0]
        print(f"[DEMO] Akun baru dibuat (user_id={demo_user_id}).")
    else:
        cursor.execute("SELECT id FROM users WHERE email = %s;", (demo_email,))
        demo_user_id = cursor.fetchone()[0]
        print(f"[DEMO] Akun sudah ada (user_id={demo_user_id}), melewati pembuatan user.")

    # 1. Default user_settings
    cursor.execute(
        """
        INSERT INTO user_settings (
            user_id, alert_threshold_db, tts_speech_rate, auto_detect_sign, haptic_enabled
        )
        VALUES (%s, 75, 1.0, TRUE, TRUE)
        ON CONFLICT (user_id) DO NOTHING;
        """,
        (demo_user_id,),
    )

    # 2. 2 Kartu Kustom (idempotent berdasarkan user_id + title)
    demo_cards = [
        (
            "transaksi",
            "Pesan Kopi Tanpa Gula",
            "Permisi, saya mau pesan satu kopi hitam tanpa gula, tidak pakai es. Terima kasih.",
            True,
        ),
        (
            "transportasi",
            "Turun di Halte Stasiun",
            "Permisi Pak/Bu, saya mau turun di Halte Stasiun Kota. Mohon beri isyarat jika sudah dekat.",
            False,
        ),
    ]
    cards_inserted = 0
    for category, title, message, is_pinned in demo_cards:
        cursor.execute(
            "SELECT 1 FROM quick_cards WHERE user_id = %s AND title = %s;",
            (demo_user_id, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO quick_cards (user_id, category, title, message, is_pinned)
                VALUES (%s, %s, %s, %s, %s);
                """,
                (demo_user_id, category, title, message, is_pinned),
            )
            cards_inserted += 1

    # 3. 3 Riwayat Translation Logs (idempotent berdasarkan user_id + mode + final_text)
    demo_logs = [
        ("sign_to_text", "SAYA MAU MINUM", "Saya ingin minum.", 0.95),
        ("sign_to_text", "TERIMA KASIH BANTU", "Terima kasih atas bantuannya.", 0.92),
        (
            "speech_to_text",
            None,
            "Silakan tunggu sebentar, pesanan Anda sedang disiapkan.",
            None,
        ),
    ]
    logs_inserted = 0
    for mode, raw_gloss, final_text, confidence in demo_logs:
        cursor.execute(
            """
            SELECT 1 FROM translation_logs
            WHERE user_id = %s AND mode = %s AND final_text = %s;
            """,
            (demo_user_id, mode, final_text),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO translation_logs (user_id, mode, raw_gloss, final_text, confidence)
                VALUES (%s, %s, %s, %s, %s);
                """,
                (demo_user_id, mode, raw_gloss, final_text, confidence),
            )
            logs_inserted += 1

    # 4. 2 Log Sound Alerts (idempotent berdasarkan user_id + sound_type + decibel_level)
    demo_alerts = [
        ("Klakson Kendaraan", 82.5, "warning"),
        ("Sirine Ambulans", 93.0, "danger"),
    ]
    alerts_inserted = 0
    for sound_type, decibel_level, severity in demo_alerts:
        cursor.execute(
            """
            SELECT 1 FROM sound_alerts
            WHERE user_id = %s AND sound_type = %s AND decibel_level = %s;
            """,
            (demo_user_id, sound_type, decibel_level),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO sound_alerts (user_id, sound_type, decibel_level, severity)
                VALUES (%s, %s, %s, %s);
                """,
                (demo_user_id, sound_type, decibel_level, severity),
            )
            alerts_inserted += 1

    print(
        f"[DEMO] Selesai! Ditambahkan: {cards_inserted} kartu kustom, "
        f"{logs_inserted} log terjemahan, {alerts_inserted} log peringatan suara."
    )
    print(f"[DEMO] Kredensial login: {demo_email} / {demo_password}")


def run_seeds(with_demo: bool = False) -> None:
    db_url = get_database_url()
    if not SEEDS_DIR.exists():
        print(f"[ERROR] Folder seeds tidak ditemukan: {SEEDS_DIR}")
        sys.exit(1)

    sql_files = sorted(SEEDS_DIR.glob("*.sql"))

    try:
        conn = psycopg2.connect(db_url)
    except psycopg2.OperationalError as exc:
        print(f"[ERROR] Gagal terhubung ke PostgreSQL ({db_url}):\n  {exc}")
        print(
            "\n[TIPS] Pastikan Docker Desktop aktif dan jalankan: docker compose up -d"
        )
        sys.exit(1)

    try:
        with conn:
            with conn.cursor() as cur:
                for sql_file in sql_files:
                    print(f"[SEED]  Menjalankan {sql_file.name}...")
                    cur.execute(sql_file.read_text(encoding="utf-8"))
                    print(f"[OK]    {sql_file.name} selesai.")

                if with_demo:
                    seed_demo_data(cur)

        print("\n[DONE] Seeding database selesai tanpa error.")
    except Exception as exc:
        conn.rollback()
        print(f"[ERROR] Seeding gagal dan telah di-rollback: {exc}")
        print(
            "[TIPS] Jika tabel belum dibuat, jalankan dulu: python scripts/migrate.py"
        )
        sys.exit(1)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Jalankan seeder database PostgreSQL untuk backend Isyarat Kita."
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Sertakan akun demo (demo@isyaratkita.id / demo1234) dan contoh data.",
    )
    args = parser.parse_args()
    run_seeds(with_demo=args.demo)


if __name__ == "__main__":
    main()
