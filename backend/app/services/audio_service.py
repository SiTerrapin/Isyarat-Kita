import logging
import time
from typing import Any, Optional

import numpy as np

from app.services.sound_service import classify_sound_pattern

logger = logging.getLogger(__name__)

# Maksimal 1.5 detik audio @ 16kHz agar inferensi AST super cepat (< 0.5 detik)
MAX_AUDIO_SAMPLES = int(16000 * 1.5)

# Blacklist label gesekan mikrofon / angin / static yang sering memicu false alarm
IGNORE_LABELS: set[str] = {
    "wind",
    "rustle",
    "scratch",
    "static",
    "white noise",
    "pink noise",
    "rub",
    "clicking",
    "microphone",
    "wind noise (microphone)",
    "rustling leaves",
    "hiss",
    "hum",
    "buzz",
}

# Mapping label AudioSet -> (category, label_id Bahasa Indonesia, severity)
AUDIOSET_CATEGORY_MAP: dict[str, tuple[str, str, str]] = {
    # 1. Klakson & Lalu Lintas (traffic)
    "vehicle horn, car horn, honking": ("traffic", "Klakson Kendaraan", "high"),
    "air horn, truck horn": ("traffic", "Klakson Truk / Bus", "high"),
    "toot": ("traffic", "Klakson Kendaraan", "high"),
    "motorcycle": ("traffic", "Suara Motor Keras", "medium"),
    "brake squeal": ("traffic", "Suara Rem Berdecit", "high"),
    "skidding": ("traffic", "Suara Ban Berdecit", "high"),
    # 2. Alarm & Sirine Darurat (emergency)
    "fire alarm": ("emergency", "Alarm Kebakaran", "high"),
    "smoke detector, smoke alarm": ("emergency", "Alarm Asap / Kebakaran", "high"),
    "siren": ("emergency", "Sirine Darurat", "high"),
    "civil defense siren": ("emergency", "Sirine Peringatan Darurat", "high"),
    "ambulance (siren)": ("emergency", "Sirine Ambulans", "high"),
    "police car (siren)": ("emergency", "Sirine Polisi", "high"),
    "fire engine, fire truck (siren)": ("emergency", "Sirine Pemadam Kebakaran", "high"),
    "alarm": ("emergency", "Alarm Peringatan", "high"),
    "buzzer": ("emergency", "Buzzer Peringatan", "high"),
    # 3. Teriakan & Bahaya (danger)
    "screaming": ("danger", "Suara Teriakan", "high"),
    "shout": ("danger", "Suara Teriakan / Seruan", "high"),
    "yell": ("danger", "Suara Teriakan Keras", "high"),
    "explosion": ("danger", "Suara Ledakan", "high"),
    "glass": ("danger", "Suara Kaca Pecah", "high"),
    "shatter": ("danger", "Suara Benda Pecah", "high"),
    "rumble": ("danger", "Suara Gemuruh / Benturan", "high"),
    # 4. Panggilan Rumah (home)
    "doorbell": ("home", "Bel Pintu Berbunyi", "medium"),
    "knock": ("home", "Ketukan Pintu", "medium"),
    "baby cry, infant cry": ("home", "Tangisan Bayi", "medium"),
    "telephone bell ringing": ("home", "Dering Telepon", "medium"),
}

ALERT_CONFIDENCE_THRESHOLD = 0.35


def _is_ignored_label(label: str) -> bool:
    low = label.strip().lower()
    if low in IGNORE_LABELS:
        return True
    return any(
        bad in low
        for bad in (
            "wind",
            "rustle",
            "scratch",
            "static",
            "white noise",
            "pink noise",
            "microphone",
            "rub",
        )
    )


def _match_audioset_category(label: str) -> Optional[tuple[str, str, str]]:
    low = label.strip().lower()
    if low in AUDIOSET_CATEGORY_MAP:
        return AUDIOSET_CATEGORY_MAP[low]
    for key, meta in AUDIOSET_CATEGORY_MAP.items():
        if key in low or low in key:
            return meta
    return None


def evaluate_audioset_predictions(
    preds: list[dict[str, Any]],
    decibel_level: float = 75.0,
) -> dict[str, Any]:
    """
    Evaluasi prediksi MIT/ast-finetuned-audioset:
    1. Filter anti-gesekan mic (Wind, Rustle, Scratch, Static, Microphone, dll.)
    2. Mapping kategori darurat & harian (confidence >= 0.35).
    """
    if not preds:
        return {
            "is_alert": False,
            "detected": False,
            "category": "none",
            "label_id": "Tidak Ada Suara Darurat",
            "sound_type": "Tidak Ada Suara Darurat",
            "confidence": 0.0,
            "severity": "low",
            "decibel_level": decibel_level,
            "raw_label": None,
        }

    top = preds[0]
    top_label = str(top.get("label", "")).strip()
    top_score = float(top.get("score", 0.0))

    if _is_ignored_label(top_label):
        return {
            "is_alert": False,
            "detected": False,
            "category": "none",
            "label_id": "Gesekan Mikrofon / Angin (Diabaikan)",
            "sound_type": "Gesekan Mikrofon / Angin (Diabaikan)",
            "confidence": round(top_score, 3),
            "severity": "low",
            "decibel_level": decibel_level,
            "raw_label": top_label,
        }

    for item in preds[:5]:
        lbl = str(item.get("label", "")).strip()
        sc = float(item.get("score", 0.0))
        if sc < ALERT_CONFIDENCE_THRESHOLD or _is_ignored_label(lbl):
            continue
        mapped = _match_audioset_category(lbl)
        if mapped:
            category, label_id, severity = mapped
            return {
                "is_alert": True,
                "detected": True,
                "category": category,
                "label_id": label_id,
                "sound_type": label_id,
                "confidence": round(sc, 3),
                "severity": severity,
                "decibel_level": decibel_level,
                "raw_label": lbl,
            }

    if decibel_level >= 78.0 and not _is_ignored_label(top_label):
        return {
            "is_alert": True,
            "detected": True,
            "category": "danger" if decibel_level >= 88.0 else "home",
            "label_id": "Suara Keras Terdeteksi",
            "sound_type": "Suara Keras Terdeteksi",
            "confidence": round(max(0.45, top_score), 3),
            "severity": "high" if decibel_level >= 88.0 else "medium",
            "decibel_level": decibel_level,
            "raw_label": top_label,
        }

    return {
        "is_alert": False,
        "detected": False,
        "category": "none",
        "label_id": "Lingkungan Aman",
        "sound_type": "Lingkungan Aman",
        "confidence": round(top_score, 3),
        "severity": "low",
        "decibel_level": decibel_level,
        "raw_label": top_label,
    }


def _is_mic_friction_spectral(audio_np: np.ndarray, sample_rate: int = 16000) -> bool:
    """Deteksi gesekan jari / hembusan angin pada mikrofon (dominan sub-bass < 160 Hz)."""
    if audio_np.size < 1600:
        return False
    from scipy import signal

    freqs, psd = signal.welch(audio_np, fs=sample_rate, nperseg=min(1024, audio_np.size))
    total = float(np.sum(psd)) + 1e-12
    sub_bass = float(np.sum(psd[freqs < 160.0]) / total)
    mid_high = float(np.sum(psd[(freqs >= 350.0) & (freqs <= 4000.0)]) / total)
    return sub_bass >= 0.72 and mid_high <= 0.15


class AudioAlertService:
    """
    Singleton AudioSet Classifier super cepat:
    - Muat MIT/ast-finetuned-audioset-10-10-0.4593 sekali saat startup (jika tersedia di cache)
    - Inferensi dengan torch.no_grad() pada maks 1.5 detik audio 16kHz (< 0.5 detik)
    - Fallback spektral instan + anti-gesekan mic jika bobot AST belum ada di cache.
    """

    def __init__(self) -> None:
        self._extractor: Any = None
        self._model: Any = None
        self._device: Any = None
        self._load_ast_singleton()

    def _load_ast_singleton(self) -> None:
        try:
            import torch
            from transformers import (
                AutoFeatureExtractor,
                AutoModelForAudioClassification,
            )

            model_id = "MIT/ast-finetuned-audioset-10-10-0.4593"
            self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self._extractor = AutoFeatureExtractor.from_pretrained(
                model_id, local_files_only=True
            )
            self._model = (
                AutoModelForAudioClassification.from_pretrained(
                    model_id, local_files_only=True
                )
                .to(self._device)
                .eval()
            )
            logger.info("AST AudioSet singleton siap di %s.", self._device)
        except Exception:
            self._extractor = None
            self._model = None

    def _run_ast_fast(self, audio_np: np.ndarray, sample_rate: int = 16000) -> list[dict[str, Any]]:
        import torch

        inputs = self._extractor(
            audio_np,
            sampling_rate=sample_rate,
            return_tensors="pt",
        )
        inputs = {k: v.to(self._device) for k, v in inputs.items()}
        with torch.no_grad():
            logits = self._model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
            top_scores, top_ids = torch.topk(probs, k=5)

        id2label = self._model.config.id2label
        return [
            {
                "label": str(id2label[int(idx.item())]),
                "score": float(score.item()),
            }
            for score, idx in zip(top_scores, top_ids)
        ]

    @staticmethod
    def _map_spectral_to_response(spectral: dict[str, Any]) -> dict[str, Any]:
        cat_map = {
            "klakson": ("traffic", "Klakson Kendaraan", "high"),
            "sirine": ("emergency", "Sirine Darurat", "high"),
            "alarm": ("emergency", "Alarm / Bel Peringatan", "high"),
            "teriakan": ("danger", "Suara Teriakan", "high"),
            "ketukan": ("home", "Ketukan Pintu / Benturan", "medium"),
            "bising": ("danger", "Suara Keras Terdeteksi", "medium"),
        }
        raw_cat = spectral.get("category", "tenang")
        db = float(spectral.get("decibel_level", 0.0))
        conf = float(spectral.get("confidence", 0.0))

        if not spectral.get("detected") or raw_cat == "tenang":
            return {
                "is_alert": False,
                "detected": False,
                "category": "none",
                "label_id": "Lingkungan Aman",
                "sound_type": "Lingkungan Aman",
                "confidence": conf,
                "severity": "low",
                "decibel_level": db,
                "raw_label": raw_cat,
            }

        category, label_id, severity = cat_map.get(
            raw_cat, ("home", "Suara Keras Terdeteksi", "medium")
        )
        return {
            "is_alert": True,
            "detected": True,
            "category": category,
            "label_id": label_id,
            "sound_type": label_id,
            "confidence": conf,
            "severity": severity,
            "decibel_level": db,
            "raw_label": raw_cat,
        }

    def analyze_audio(
        self,
        audio_np: np.ndarray,
        sample_rate: int = 16000,
    ) -> dict[str, Any]:
        t0 = time.perf_counter()

        # Ambil maks 1.5 detik terakhir agar proses inferensi selalu < 0.5 detik
        if audio_np.size > MAX_AUDIO_SAMPLES:
            audio_np = audio_np[-MAX_AUDIO_SAMPLES:]

        rms = float(np.sqrt(np.mean(audio_np ** 2))) + 1e-9
        dbfs = 20.0 * float(np.log10(rms))
        visual_db = round(max(0.0, min(100.0, ((dbfs + 65.0) / 65.0) * 100.0)), 1)

        if _is_mic_friction_spectral(audio_np, sample_rate=sample_rate):
            result = {
                "is_alert": False,
                "detected": False,
                "category": "none",
                "label_id": "Gesekan Mikrofon / Angin (Diabaikan)",
                "sound_type": "Gesekan Mikrofon / Angin (Diabaikan)",
                "confidence": 0.9,
                "severity": "low",
                "decibel_level": visual_db,
                "raw_label": "microphone_friction",
            }
        elif self._model is not None and self._extractor is not None:
            preds = self._run_ast_fast(audio_np, sample_rate=sample_rate)
            result = evaluate_audioset_predictions(preds, decibel_level=visual_db)
        else:
            spectral = classify_sound_pattern(audio_np, sample_rate=sample_rate)
            result = self._map_spectral_to_response(spectral)

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "[AUDIO] total=%dms | top_label=%s (%.2f) | is_alert=%s",
            elapsed_ms,
            result.get("raw_label") or result["label_id"],
            result["confidence"],
            result["is_alert"],
        )
        return result


audio_alert_service = AudioAlertService()
