from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

TranslationMode = Literal["sign_to_text", "speech_to_text"]


class TranslationLogCreate(BaseModel):
    mode: TranslationMode
    raw_gloss: Optional[str] = None
    final_text: str = Field(..., min_length=1)
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class TranslationLogResponse(BaseModel):
    id: int
    user_id: int
    mode: TranslationMode
    raw_gloss: Optional[str] = None
    final_text: str
    confidence: Optional[float] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
