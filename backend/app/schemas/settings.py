from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

TTSVoiceType = Literal[
    "ROLEPLAY",
    "id-ID-ArdiNeural",
    "id-ID-GadisNeural",
    "gtts",
    "device",
]


class UserSettingUpdate(BaseModel):
    alert_threshold_db: Optional[int] = Field(default=None, ge=30, le=130)
    tts_speech_rate: Optional[float] = Field(default=None, ge=0.25, le=2.5)
    tts_voice: Optional[TTSVoiceType] = None
    auto_detect_sign: Optional[bool] = None
    haptic_enabled: Optional[bool] = None


class UserSettingResponse(BaseModel):
    user_id: int
    alert_threshold_db: int
    tts_speech_rate: float
    tts_voice: str
    auto_detect_sign: bool
    haptic_enabled: bool
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
