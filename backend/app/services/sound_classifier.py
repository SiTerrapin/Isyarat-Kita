from typing import Any

import numpy as np

from app.services.sound_service import classify_sound_pattern


class SoundClassifierService:
    """
    Wrapper modular untuk klasifikasi pola suara darurat/lingkungan
    (klakson, sirine, alarm, teriakan, ketukan, bising).
    """

    @staticmethod
    def classify(audio_np: np.ndarray, sample_rate: int = 16000) -> dict[str, Any]:
        return classify_sound_pattern(audio_np, sample_rate=sample_rate)


sound_classifier = SoundClassifierService()
