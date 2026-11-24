from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import User, UserSetting
from app.schemas.settings import UserSettingResponse, UserSettingUpdate

router = APIRouter(prefix="/api/settings", tags=["User Settings"])


def _get_or_create_settings(db: Session, user_id: int) -> UserSetting:
    user_settings = db.query(UserSetting).filter(UserSetting.user_id == user_id).first()
    if user_settings is None:
        user_settings = UserSetting(user_id=user_id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    return user_settings


@router.get("", response_model=UserSettingResponse)
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingResponse:
    user_settings = _get_or_create_settings(db, current_user.id)
    return UserSettingResponse.model_validate(user_settings)


@router.put("", response_model=UserSettingResponse)
def update_settings(
    payload: UserSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSettingResponse:
    user_settings = _get_or_create_settings(db, current_user.id)

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user_settings, field, value)
    user_settings.updated_at = func.now()

    db.commit()
    db.refresh(user_settings)
    return UserSettingResponse.model_validate(user_settings)
