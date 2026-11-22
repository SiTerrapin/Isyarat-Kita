from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import TranslationLog, User
from app.schemas.logs import TranslationLogCreate, TranslationLogResponse

router = APIRouter(prefix="/api/logs", tags=["Translation Logs"])


@router.get("", response_model=list[TranslationLogResponse])
def list_logs(
    limit: Optional[int] = Query(default=50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TranslationLogResponse]:
    query = (
        db.query(TranslationLog)
        .filter(TranslationLog.user_id == current_user.id)
        .order_by(desc(TranslationLog.created_at), desc(TranslationLog.id))
    )
    if limit is not None:
        query = query.limit(limit)
    return [TranslationLogResponse.model_validate(item) for item in query.all()]


@router.post("", response_model=TranslationLogResponse, status_code=status.HTTP_201_CREATED)
def create_log(
    payload: TranslationLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TranslationLogResponse:
    log = TranslationLog(
        user_id=current_user.id,
        mode=payload.mode,
        raw_gloss=payload.raw_gloss,
        final_text=payload.final_text.strip(),
        confidence=payload.confidence,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return TranslationLogResponse.model_validate(log)


@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    log_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    log = db.query(TranslationLog).filter(TranslationLog.id == log_id).first()
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Riwayat terjemahan tidak ditemukan.",
        )
    if log.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Anda tidak memiliki izin untuk menghapus riwayat ini.",
        )

    db.delete(log)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
