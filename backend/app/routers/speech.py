import base64
import logging
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, File, HTTPException, Response, UploadFile, status

from app.core.config import settings
from app.schemas.ai import STTResponse, TTSRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Audio STT & TTS"])

_whisper_model: Any = None


def _get_whisper_model() -> Any:
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    from faster_whisper import WhisperModel

    logger.info(
        "Memuat model faster-whisper (%s, cpu, int8)...", settings.STT_MODEL_SIZE
    )
    _whisper_model = WhisperModel(
        settings.STT_MODEL_SIZE,
        device="cpu",
        compute_type="int8",
    )
    return _whisper_model


def _convert_to_wav_16k(input_path: str) -> str:
    """
    Konversi file audio (.m4a/.3gp/.mp4/.webm/.wav) menjadi WAV 16kHz mono PCM
    menggunakan binary ffmpeg bawaan imageio-ffmpeg (tanpa butuh instalasi PATH manual).
    """
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    wav_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    wav_path = wav_tmp.name
    wav_tmp.close()

    cmd = [
        ffmpeg_exe,
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        wav_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if proc.returncode != 0 or not os.path.exists(wav_path) or os.path.getsize(wav_path) < 100:
        stderr_snippet = (proc.stderr or "").strip()[-300:]
        try:
            if os.path.exists(wav_path):
                os.remove(wav_path)
        except OSError:
            pass
        raise RuntimeError(f"Konversi audio ffmpeg gagal: {stderr_snippet}")

    return wav_path


def _load_wav_as_float32(wav_path: str) -> np.ndarray:
    """Baca file WAV 16kHz mono 16-bit PCM ke float32 numpy array (bypass PyAV decode_audio)."""
    with wave.open(wav_path, "rb") as wf:
        frames = wf.readframes(wf.getnframes())
    pcm = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    return pcm


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(file: UploadFile = File(...)) -> STTResponse:
    """
    Transkripsi rekaman audio (.m4a / .wav / .3gp / .mp4) ke teks Bahasa Indonesia (id-ID).
    Aman terhadap Windows file-lock dan tidak membutuhkan instalasi ffmpeg manual di PATH.
    """
    audio_bytes = await file.read()
    logger.info(
        "[STT] Upload diterima: filename=%s, content_type=%s, size=%d bytes",
        file.filename,
        file.content_type,
        len(audio_bytes),
    )

    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File audio kosong (0 bytes). Pastikan mikrofon diizinkan lalu rekam ulang.",
        )

    suffix = Path(file.filename or "recording.m4a").suffix.lower() or ".m4a"
    raw_tmp_path: str | None = None
    wav_tmp_path: str | None = None

    try:
        # Tulis ke file temporary lalu TUTUP dulu sebelum dibaca ffmpeg (hindari PermissionError Windows)
        raw_tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        raw_tmp_path = raw_tmp.name
        raw_tmp.write(audio_bytes)
        raw_tmp.flush()
        raw_tmp.close()

        # Konversi ke WAV 16kHz mono PCM via imageio-ffmpeg lalu muat ke float32 numpy array
        wav_tmp_path = _convert_to_wav_16k(raw_tmp_path)
        audio_np = _load_wav_as_float32(wav_tmp_path)

        if audio_np.size < 1600:
            return STTResponse(
                text="",
                confidence=0.0,
                warning="Rekaman terlalu singkat. Tekan rekam, bicara jelas, lalu tekan Stop.",
            )

        try:
            model = _get_whisper_model()
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Library STT (faster-whisper) belum terinstal di server.",
            ) from exc

        segments, _info = model.transcribe(
            audio_np,
            language="id",
            beam_size=3,
            vad_filter=True,
        )
        segments_list = list(segments)
        transcript = " ".join(
            seg.text.strip() for seg in segments_list if seg.text.strip()
        ).strip()

        if not transcript:
            logger.info("[STT] Audio valid tetapi tidak ada ucapan yang terdeteksi.")
            return STTResponse(
                text="",
                confidence=0.0,
                warning="Suara tidak terdengar jelas, coba ulangi lebih dekat ke mikrofon.",
            )

        import math

        probs = [
            math.exp(max(-5.0, min(0.0, seg.avg_logprob))) for seg in segments_list
        ]
        confidence = round(min(0.99, max(0.5, sum(probs) / len(probs))), 2)
        logger.info("[STT] Berhasil: text='%s' (conf=%.2f)", transcript, confidence)
        return STTResponse(text=transcript, confidence=confidence, warning=None)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[STT] Error tak terduga saat memproses audio: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error konversi/transkripsi di server: {exc}",
        ) from exc
    finally:
        for path_to_clean in (wav_tmp_path, raw_tmp_path):
            if path_to_clean and os.path.exists(path_to_clean):
                try:
                    os.remove(path_to_clean)
                except OSError:
                    pass


def _format_edge_rate(rate: float) -> str:
    pct = int(round((rate - 1.0) * 100))
    pct = max(-50, min(100, pct))
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


@router.post("/tts")
async def text_to_speech(payload: TTSRequest) -> Any:
    """
    Generate suara Bahasa Indonesia Multi-Voice:
    - ROLEPLAY: deaf -> id-ID-ArdiNeural (Mas Ardi), hearing -> id-ID-GadisNeural (Mbak Gadis)
    - id-ID-ArdiNeural / id-ID-GadisNeural: edge-tts Neural
    - gtts: Google TTS standar (Bahasa Indonesia)
    """
    text = payload.text.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teks tidak boleh kosong.",
        )

    if payload.voice == "device":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mode 'device' diputar langsung di perangkat HP menggunakan Expo Speech.",
        )

    effective_voice = payload.voice
    if payload.voice == "ROLEPLAY":
        effective_voice = (
            "id-ID-ArdiNeural" if payload.speaker == "deaf" else "id-ID-GadisNeural"
        )

    audio_bytes: bytes = b""

    if effective_voice == "gtts":
        try:
            import io
            from gtts import gTTS

            buf = io.BytesIO()
            tts = gTTS(text=text, lang="id", slow=payload.rate < 0.85)
            tts.write_to_fp(buf)
            audio_bytes = buf.getvalue()
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Library gTTS belum terinstal di server.",
            ) from exc
        except Exception as exc:
            logger.exception("Gagal menghasilkan gTTS: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Layanan gTTS sedang tidak terjangkau. Gunakan suara bawaan HP.",
            ) from exc
    else:
        try:
            import edge_tts

            communicate = edge_tts.Communicate(
                text=text,
                voice=effective_voice,
                rate=_format_edge_rate(payload.rate),
            )
            audio_chunks: list[bytes] = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])
            audio_bytes = b"".join(audio_chunks)
        except ImportError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Library edge-tts belum terinstal di server.",
            ) from exc
        except Exception as exc:
            logger.exception("Gagal menghasilkan edge-tts: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Layanan neural TTS sedang tidak terjangkau. Gunakan suara bawaan HP.",
            ) from exc

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gagal menghasilkan audio TTS.",
        )

    if payload.format == "base64":
        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "mime_type": "audio/mpeg",
            "voice": effective_voice,
        }

    return Response(content=audio_bytes, media_type="audio/mpeg")
