import logging
import time

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.routers import ai, alerts, auth, cards, logs, settings as settings_router, speech
from app.services.vision_service import vision_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("isyarat_kita.http")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Backend REST API untuk aplikasi mobile Isyarat Kita — "
        "Asisten Komunikasi Dua Arah BISINDO & Peringatan Suara Darurat untuk Teman Tuli."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def debug_request_logger(request: Request, call_next):
    start = time.perf_counter()
    client_ip = request.client.host if request.client else "unknown"
    try:
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "[%s] %s %s -> %d (%.0fms)",
            client_ip,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "[%s] %s %s -> UNHANDLED ERROR (%.0fms): %s",
            client_ip,
            request.method,
            request.url.path,
            elapsed_ms,
            exc,
        )
        raise

app.include_router(auth.router)
app.include_router(cards.router)
app.include_router(logs.router)
app.include_router(alerts.router)
app.include_router(settings_router.router)
app.include_router(ai.router)
app.include_router(speech.router)


@app.get("/health", tags=["System Health"])
def health_check(db: Session = Depends(get_db)) -> dict[str, object]:
    db_status = "connected"
    overall_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "disconnected"
        overall_status = "degraded"

    ai_status = vision_service.get_status()
    return {
        "status": overall_status,
        "database": db_status,
        "ai_mode": ai_status["ai_mode"],
        "model_loaded": ai_status["model_loaded"],
    }
