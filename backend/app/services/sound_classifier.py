from typing import Any

import numpy as np

from app.services.audio_service import audio_alert_service


class SoundClassifierService:
    """Wrapper modular cepat untuk klasifikasi pola suara darurat & harian."""

    @staticmethod
    def classify(audio_np: np.ndarray, sample_rate: int = 16000) -> dict[str, Any]:
        return audio_alert_service.analyze_audio(
            audio_np=audio_np,
            sample_rate=sample_rate,
        )


sound_classifier = SoundClassifierService()
