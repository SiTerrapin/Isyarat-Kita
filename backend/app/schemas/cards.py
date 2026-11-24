from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CardCategory = Literal["darurat", "kesehatan", "transportasi", "transaksi", "umum"]


class QuickCardCreate(BaseModel):
    category: CardCategory
    title: str = Field(..., min_length=1, max_length=100)
    message: str = Field(..., min_length=1)
    is_pinned: bool = False


class QuickCardUpdate(BaseModel):
    category: Optional[CardCategory] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    message: Optional[str] = Field(default=None, min_length=1)
    is_pinned: Optional[bool] = None


class QuickCardResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    category: CardCategory
    title: str
    message: str
    is_pinned: bool
    is_custom: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
