import base64
import binascii

from fastapi import APIRouter, HTTPException, Request, status

from app.schemas.ai import (
    ChatAIRequest,
    ChatAIResponse,
    CorrectWordRequest,
    CorrectWordResponse,
    PredictSignBase64Request,
    PredictSignResponse,
    RefineTextRequest,
    RefineTextResponse,
)
from app.services.nlp_service import generate_ai_reply, nlp_processor
from app.services.vision_service import vision_service

router = APIRouter(prefix="/api", tags=["AI BISINDO Service"])


def _decode_base64_image(raw_b64: str) -> bytes:
    cleaned = raw_b64.strip()
    if "," in cleaned and cleaned.lower().startswith("data:"):
        cleaned = cleaned.split(",", 1)[1]
    try:
        return base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format image_base64 tidak valid.",
        ) from exc


@router.post("/predict-sign", response_model=PredictSignResponse)
async def predict_sign(request: Request) -> PredictSignResponse:
    """
    Deteksi huruf isyarat BISINDO dari frame kamera (bisa dipakai Guest tanpa login).
    Mendukung multipart/form-data (field 'file') atau JSON ({'image_base64': '...'}).
    """
    content_type = request.headers.get("content-type", "").lower()
    image_bytes: bytes
    roi_box: dict[str, float] | None = None
    mirror: bool = False

    if "multipart/form-data" in content_type:
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Field multipart 'file' wajib disertakan.",
            )
        image_bytes = await upload.read()
        mirror_raw = str(form.get("mirror", "false")).strip().lower()
        mirror = mirror_raw in {"1", "true", "yes", "on"}
    elif "application/json" in content_type:
        try:
            body = await request.json()
            parsed = PredictSignBase64Request.model_validate(body)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Body JSON tidak valid: {exc}",
            ) from exc
        image_bytes = _decode_base64_image(parsed.image_base64)
        if parsed.roi_box is not None:
            roi_box = parsed.roi_box.model_dump()
        mirror = bool(parsed.mirror)
    else:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Gunakan multipart/form-data (field 'file') atau application/json ({'image_base64': '...'}).",
        )

    try:
        result = vision_service.predict_sign(
            image_bytes,
            roi_box=roi_box,
            mirror=mirror,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return PredictSignResponse(**result)


@router.post("/correct-word", response_model=CorrectWordResponse)
def correct_word(payload: CorrectWordRequest) -> CorrectWordResponse:
    """Koreksi ejaan huruf BISINDO menjadi kata Bahasa Indonesia baku (Guest boleh akses)."""
    result = nlp_processor.correct_letters(payload.letters, prev_word=payload.prev_word)
    return CorrectWordResponse(**result)


@router.post("/refine-text", response_model=RefineTextResponse)
def refine_text(payload: RefineTextRequest) -> RefineTextResponse:
    """Rangkai urutan gloss BISINDO menjadi kalimat Bahasa Indonesia alami (Hybrid Gemini + Lokal) + opsional balasan Chat AI."""
    tokens: list[str] = []
    if payload.gloss:
        tokens.extend(payload.gloss)
    if payload.text:
        tokens.extend(payload.text.split())
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'gloss' atau 'text' wajib diisi.",
        )
    result = nlp_processor.refine_gloss_to_natural(tokens)
    refined = result.get("sentence", "")
    ai_reply = generate_ai_reply(refined) if (payload.include_reply and refined) else None
    return RefineTextResponse(
        sentence=refined,
        refined_text=refined,
        source=result["source"],
        raw_gloss=result["raw_gloss"],
        ai_reply=ai_reply,
    )


@router.post("/chat-ai", response_model=ChatAIResponse)
def chat_ai(payload: ChatAIRequest) -> ChatAIResponse:
    """Hasilkan balasan percakapan dua arah yang ramah dan singkat untuk kalimat BISINDO."""
    clean_text = payload.text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'text' tidak boleh kosong.",
        )
    reply = generate_ai_reply(clean_text)
    return ChatAIResponse(refined_text=clean_text, ai_reply=reply)
