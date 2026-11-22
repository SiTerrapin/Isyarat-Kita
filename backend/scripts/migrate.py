#!/usr/bin/env python3
"""
Migration Runner untuk Database PostgreSQL Isyarat Kita.

Penggunaan:
    python scripts/migrate.py           # Jalankan migrasi yang belum diterapkan
    python scripts/migrate.py --fresh   # Drop seluruh tabel & migrasi ulang dari awal
"""

import argparse
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BASE_DIR / "migrations"
ENV_FILE = BASE_DIR / ".env"
DEFAULT_DATABASE_URL = "postgresql://postgres:password123@localhost:15432/isyarat_kita"

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
    # psycopg2 menerima scheme postgresql:// (tanpa +psycopg2)
    if raw_url.startswith("postgresql+psycopg2://"):
        raw_url = raw_url.replace("postgresql+psycopg2://", "postgresql://", 1)
    return raw_url


def drop_all_tables(cursor) -> None:
    print("[FRESH] Menghapus seluruh tabel yang ada...")
    cursor.execute(
        """
        DROP TABLE IF EXISTS
            user_settings,
            sound_alerts,
            translation_logs,
            quick_cards,
            users,
            schema_migrations
        CASCADE;
        """
    )
    print("[FRESH] Seluruh tabel berhasil dihapus.")


def ensure_migrations_table(cursor) -> None:
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(100) PRIMARY KEY,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def get_applied_migrations(cursor) -> set[str]:
    cursor.execute("SELECT version FROM schema_migrations;")
    return {row[0] for row in cursor.fetchall()}


def run_migrations(fresh: bool = False) -> None:
    db_url = get_database_url()
    if not MIGRATIONS_DIR.exists():
        print(f"[ERROR] Folder migrasi tidak ditemukan: {MIGRATIONS_DIR}")
        sys.exit(1)

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not sql_files:
        print("[INFO] Tidak ada file migrasi (*.sql) di folder migrations/.")
        return

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
                if fresh:
                    drop_all_tables(cur)

                ensure_migrations_table(cur)
                applied = get_applied_migrations(cur)

                executed_count = 0
                for sql_file in sql_files:
                    version = sql_file.name
                    if version in applied:
                        print(f"[SKIP]  {version} (sudah diterapkan)")
                        continue

                    print(f"[APPLY] Menjalankan {version}...")
                    sql_content = sql_file.read_text(encoding="utf-8")
                    cur.execute(sql_content)
                    cur.execute(
                        """
                        INSERT INTO schema_migrations (version)
                        VALUES (%s)
                        ON CONFLICT (version) DO NOTHING;
                        """,
                        (version,),
                    )
                    executed_count += 1
                    print(f"[OK]    {version} selesai diterapkan.")

        if executed_count == 0:
            print("\n[DONE] Semua migrasi sudah up-to-date.")
        else:
            print(f"\n[DONE] {executed_count} file migrasi berhasil dijalankan.")
    except Exception as exc:
        conn.rollback()
        print(f"[ERROR] Migrasi gagal dan telah di-rollback: {exc}")
        sys.exit(1)
    finally:
        conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Jalankan migrasi SQL PostgreSQL untuk backend Isyarat Kita."
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Drop semua tabel lalu jalankan ulang seluruh migrasi dari awal (khusus development).",
    )
    args = parser.parse_args()
    run_migrations(fresh=args.fresh)


if __name__ == "__main__":
    main()
