from typing import Literal, Optional

from pydantic import BaseModel, Field


class PredictSignBase64Request(BaseModel):
    image_base64: str = Field(
        ...,
        min_length=1,
        description="Gambar frame kamera dalam format base64 (boleh dengan prefix data:image/...;base64,)",
    )


class TopPrediction(BaseModel):
    label: str
    score: float = Field(..., ge=0.0, le=1.0)


class PredictSignResponse(BaseModel):
    detected: bool
    hand_found: bool
    letter: Optional[str] = None
    confidence: float = Field(..., ge=0.0, le=1.0)
    top3: list[TopPrediction] = Field(default_factory=list)
    mode: Literal["mock", "model"]


class CorrectWordRequest(BaseModel):
    letters: list[str] = Field(
        ...,
        min_length=1,
        description="Daftar huruf hasil ejaan isyarat tangan, contoh: ['H', 'A', 'L', 'O']",
    )
    prev_word: Optional[str] = Field(
        default=None,
        description="Kata sebelumnya untuk bonus konteks bigram (opsional)",
    )


class CorrectWordResponse(BaseModel):
    raw_word: str
    corrected_word: str


class RefineTextRequest(BaseModel):
    gloss: list[str] = Field(
        ...,
        min_length=1,
        description="Daftar kata gloss BISINDO, contoh: ['SAYA', 'MAU', 'MINUM']",
    )


class RefineTextResponse(BaseModel):
    sentence: str
    source: Literal["dataset", "rule", "llm"]
    raw_gloss: list[str]


class STTResponse(BaseModel):
    text: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    warning: Optional[str] = None


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000)
    voice: Literal[
        "ROLEPLAY",
        "id-ID-ArdiNeural",
        "id-ID-GadisNeural",
        "gtts",
        "device",
    ] = "id-ID-ArdiNeural"
    speaker: Literal["deaf", "hearing"] = "deaf"
    rate: float = Field(default=1.0, ge=0.5, le=2.0)
    format: Literal["audio", "base64"] = "audio"
