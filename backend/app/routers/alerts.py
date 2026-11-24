from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import SoundAlert, User
from app.schemas.alerts import SoundAlertCreate, SoundAlertResponse

router = APIRouter(prefix="/api/alerts", tags=["Sound Alerts"])


@router.get("", response_model=list[SoundAlertResponse])
def list_alerts(
    limit: Optional[int] = Query(default=50, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SoundAlertResponse]:
    query = (
        db.query(SoundAlert)
        .filter(SoundAlert.user_id == current_user.id)
        .order_by(desc(SoundAlert.created_at), desc(SoundAlert.id))
    )
    if limit is not None:
        query = query.limit(limit)
    return [SoundAlertResponse.model_validate(item) for item in query.all()]


@router.post("", response_model=SoundAlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(
    payload: SoundAlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SoundAlertResponse:
    alert = SoundAlert(
        user_id=current_user.id,
        sound_type=payload.sound_type.strip(),
        decibel_level=payload.decibel_level,
        severity=payload.severity,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return SoundAlertResponse.model_validate(alert)
