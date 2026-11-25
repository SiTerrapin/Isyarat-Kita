from typing import Literal, Optional

from pydantic import BaseModel, Field


class RoiBox(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    width: float = Field(..., gt=0.0, le=1.0)
    height: float = Field(..., gt=0.0, le=1.0)


class PredictSignBase64Request(BaseModel):
    image_base64: str = Field(
        ...,
        min_length=1,
        description="Gambar frame kamera dalam format base64 (boleh dengan prefix data:image/...;base64,)",
    )
    roi_box: Optional[RoiBox] = Field(
        default=None,
        description="Area bingkai panduan ter-normalisasi (0..1) dari layar HP; jika diisi, deteksi fokus di dalam bingkai ini.",
    )
    mirror: bool = Field(
        default=False,
        description="Flip horizontal gambar sebelum deteksi (berguna untuk kalibrasi kamera depan HP).",
    )


class TopPrediction(BaseModel):
    label: str
    score: float = Field(..., ge=0.0, le=1.0)


class PredictSignResponse(BaseModel):
    detected: bool
    hand_found: bool
    hands_detected: int = 0
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
    gloss: Optional[list[str]] = Field(
        default=None,
        description="Daftar kata gloss BISINDO, contoh: ['SAYA', 'MAU', 'MINUM']",
    )
    text: Optional[str] = Field(
        default=None,
        description="Alternatif string gloss mentah, contoh: 'SAAAAYAAA MAUUU MKNNN NASI'",
    )
    include_reply: bool = Field(
        default=False,
        description="Jika True, sertakan balasan obrolan dua arah (ai_reply) dari Gemini 2.5 Flash.",
    )


class RefineTextResponse(BaseModel):
    sentence: str
    refined_text: str = ""
    source: Literal["dataset", "rule", "llm"]
    raw_gloss: list[str]
    ai_reply: Optional[str] = None


class ChatAIRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Kalimat Bahasa Indonesia natural dari pengguna BISINDO.",
    )


class ChatAIResponse(BaseModel):
    refined_text: str
    ai_reply: str


class STTResponse(BaseModel):
    text: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    warning: Optional[str] = None


class SoundDetectResponse(BaseModel):
    is_alert: bool
    detected: bool
    category: Literal["emergency", "traffic", "danger", "home", "none"]
    label_id: str
    sound_type: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    severity: Literal["high", "medium", "low"]
    decibel_level: float = Field(..., ge=0.0, le=120.0)
    raw_label: Optional[str] = None


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
