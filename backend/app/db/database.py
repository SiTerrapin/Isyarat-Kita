from collections.abc import Generator
import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine
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


engine = create_engine(
    _normalize_database_url(settings.DATABASE_URL),
    pool_pre_ping=True,
    pool_recycle=300,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Buat semua tabel ORM secara otomatis saat startup jika belum ada (aman untuk DB cloud kosong)."""
    try:
        from app.db import models as _models  # noqa: F401

        Base.metadata.create_all(bind=engine)
        logger.info("Database schema verified / initialized (create_all).")
    except Exception as exc:
        logger.warning(
            "Gagal inisialisasi tabel database saat startup (cek DATABASE_URL): %s",
            exc,
        )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
