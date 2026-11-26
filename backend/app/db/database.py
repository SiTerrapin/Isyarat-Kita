from collections.abc import Generator
import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)


def _normalize_database_url(url: str) -> str:
    """
    Normalisasi DATABASE_URL agar kompatibel penuh dengan PostgreSQL lokal maupun cloud (Neon/Supabase):
    - Mengubah prefix 'postgres://' atau 'postgresql://' menjadi 'postgresql+psycopg2://'.
    - Menambahkan 'sslmode=require' secara otomatis untuk host non-lokal bila belum tercantum.
    """
    cleaned = (url or "").strip()
    if cleaned.startswith("postgres://"):
        cleaned = cleaned.replace("postgres://", "postgresql+psycopg2://", 1)
    elif cleaned.startswith("postgresql://"):
        cleaned = cleaned.replace("postgresql://", "postgresql+psycopg2://", 1)

    parsed = urlsplit(cleaned)
    hostname = (parsed.hostname or "").lower()
    is_local = hostname in {"", "localhost", "127.0.0.1", "db", "postgres"}

    if not is_local and parsed.scheme.startswith("postgresql"):
        query_params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if "sslmode" not in query_params:
            query_params["sslmode"] = "require"
            cleaned = urlunsplit(
                (
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    urlencode(query_params),
                    parsed.fragment,
                )
            )
    return cleaned


def _build_engine_with_fallback() -> tuple[Engine, str]:
    """
    Auto-Fallback Database:
    1. Prioritas utama: DATABASE_URL_LOCAL (PostgreSQL lokal, timeout cepat 3 detik).
    2. Fallback otomatis: DATABASE_URL_DEPLOY (PostgreSQL cloud Neon/Supabase) jika lokal tidak aktif.
    3. Fallback terakhir: DATABASE_URL standar.
    """
    candidates: list[tuple[str, str, int]] = []
    seen: set[str] = set()

    raw_candidates = [
        ("local", settings.DATABASE_URL_LOCAL, 3),
        ("deploy", settings.DATABASE_URL_DEPLOY, 10),
        ("default", settings.DATABASE_URL, 5),
    ]
    for label, raw_url, timeout_sec in raw_candidates:
        if not raw_url or not raw_url.strip():
            continue
        normalized = _normalize_database_url(raw_url)
        if normalized in seen:
            continue
        seen.add(normalized)
        candidates.append((label, normalized, timeout_sec))

    last_engine: Engine | None = None
    last_label = "none"

    for label, db_url, timeout_sec in candidates:
        candidate_engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=300,
            connect_args={"connect_timeout": timeout_sec},
        )
        last_engine = candidate_engine
        last_label = label
        try:
            with candidate_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            msg = f"[DB] Terhubung ke PostgreSQL ({label.upper()})."
            logger.info(msg)
            print(msg, flush=True)
            return candidate_engine, label
        except Exception as exc:
            warn_msg = (
                f"[DB] Koneksi PostgreSQL ({label.upper()}) tidak aktif ({exc}). "
                "Mencoba kandidat database berikutnya..."
            )
            logger.warning(warn_msg)
            print(warn_msg, flush=True)
            candidate_engine.dispose()

    assert last_engine is not None
    logger.warning(
        "[DB] Semua kandidat database gagal diuji saat startup; menggunakan engine '%s' sebagai fallback pasif.",
        last_label,
    )
    return last_engine, last_label


engine, ACTIVE_DB_SOURCE = _build_engine_with_fallback()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Buat semua tabel ORM secara otomatis saat startup jika belum ada (aman untuk DB cloud kosong)."""
    try:
        from app.db import models as _models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info(
            "Database schema verified / initialized (source=%s).", ACTIVE_DB_SOURCE
        )
    except Exception as exc:
        logger.warning(
            "Gagal inisialisasi tabel database saat startup (source=%s): %s",
            ACTIVE_DB_SOURCE,
            exc,
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
