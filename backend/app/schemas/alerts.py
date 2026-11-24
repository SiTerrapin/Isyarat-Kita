from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AlertSeverity = Literal["warning", "danger"]


class SoundAlertCreate(BaseModel):
    sound_type: str = Field(..., min_length=1, max_length=50)
    decibel_level: float = Field(..., ge=0.0, le=200.0)
    severity: AlertSeverity


class SoundAlertResponse(BaseModel):
    id: int
    user_id: int
    sound_type: str
    decibel_level: float
    severity: AlertSeverity
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
