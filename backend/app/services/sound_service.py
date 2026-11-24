import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def classify_sound_pattern(audio_np: np.ndarray, sample_rate: int = 16000) -> dict[str, Any]:
    """
    Klasifikasi pola suara lingkungan/darurat secara instan menggunakan analisis spektral (FFT)
    dan amplop energi (scipy + numpy) agar responsif real-time untuk Teman Tuli.

    Mengenali pola:
    - sirine   : Sirine Darurat (ambulans / pemadam / polisi) — danger
    - klakson  : Klakson Kendaraan — danger
    - alarm    : Alarm / Bel Peringatan — warning
    - ketukan  : Ketukan Pintu / Benturan Keras — warning
    - teriakan : Teriakan / Panggilan Keras — warning
    - bising   : Suara Keras Lingkungan — warning
    """
    if audio_np.size < 800:
        return {
            "detected": False,
            "category": "tenang",
            "sound_type": "Suara Tenang",
            "severity": "warning",
            "confidence": 0.0,
            "decibel_level": 0.0,
        }

    # 1. Hitung RMS, Peak, Crest Factor, dan estimasi dB visual (0..100)
    rms = float(np.sqrt(np.mean(audio_np ** 2))) + 1e-9
    peak = float(np.max(np.abs(audio_np))) + 1e-9
    crest_factor = peak / rms
    dbfs = 20.0 * float(np.log10(rms))
    # Map -65..0 dBFS -> 0..100 dB visual
    visual_db = round(max(0.0, min(100.0, ((dbfs + 65.0) / 65.0) * 100.0)), 1)

    if rms < 0.008:
        return {
            "detected": False,
            "category": "tenang",
            "sound_type": "Lingkungan Tenang",
            "severity": "warning",
            "confidence": 0.9,
            "decibel_level": visual_db,
        }

    # 2. Analisis Spektral (Welch PSD / FFT)
    from scipy import signal

    freqs, psd = signal.welch(
        audio_np,
        fs=sample_rate,
        nperseg=min(1024, audio_np.size),
    )
    psd_sum = float(np.sum(psd)) + 1e-12
    dominant_idx = int(np.argmax(psd))
    dominant_freq = float(freqs[dominant_idx])
    spectral_peak_ratio = float(psd[dominant_idx] / psd_sum)

    # Energi per pita frekuensi
    def band_ratio(low: float, high: float) -> float:
        mask = (freqs >= low) & (freqs <= high)
        return float(np.sum(psd[mask]) / psd_sum)

    low_mid = band_ratio(300, 1200)   # Klakson & fundamental vokal
    siren_band = band_ratio(600, 2400)  # Sirine & vokal tinggi
    high_band = band_ratio(2000, 6000)  # Alarm / bel / peluit

    # 3. Analisis modulasi frekuensi antar jendela (mendeteksi sirine naik-turun)
    win = int(sample_rate * 0.15)
    dom_freqs: list[float] = []
    if audio_np.size >= win * 3:
        for start in range(0, audio_np.size - win, win):
            chunk = audio_np[start : start + win]
            if float(np.sqrt(np.mean(chunk ** 2))) < rms * 0.35:
                continue
            spec = np.abs(np.fft.rfft(chunk * np.hanning(len(chunk))))
            f_axis = np.fft.rfftfreq(len(chunk), d=1.0 / sample_rate)
            dom_freqs.append(float(f_axis[int(np.argmax(spec))]))

    freq_variation = float(np.std(dom_freqs)) if len(dom_freqs) >= 3 else 0.0

    # 4. Aturan klasifikasi pola suara
    # A. Ketukan / Benturan Keras (impulsif tajam, crest factor tinggi)
    if crest_factor >= 6.5 and spectral_peak_ratio < 0.25:
        return {
            "detected": True,
            "category": "ketukan",
            "sound_type": "Ketukan Pintu / Benturan Keras",
            "severity": "warning",
            "confidence": round(min(0.95, 0.72 + (crest_factor - 6.5) * 0.04), 2),
            "decibel_level": visual_db,
        }

    # B. Alarm / Bel Peringatan (nada tinggi tajam > 1800 Hz)
    if dominant_freq >= 1800 and (high_band >= 0.45 or spectral_peak_ratio >= 0.22):
        return {
            "detected": True,
            "category": "alarm",
            "sound_type": "Alarm / Bel Peringatan",
            "severity": "danger" if visual_db >= 80 else "warning",
            "confidence": round(min(0.96, 0.75 + high_band * 0.25), 2),
            "decibel_level": visual_db,
        }

    # C. Sirine Darurat (modulasi frekuensi jelas di pita 600-2400 Hz)
    if siren_band >= 0.50 and freq_variation >= 90.0 and 500 <= dominant_freq <= 2500:
        return {
            "detected": True,
            "category": "sirine",
            "sound_type": "Sirine Darurat",
            "severity": "danger",
            "confidence": round(min(0.96, 0.78 + min(0.18, freq_variation / 800.0)), 2),
            "decibel_level": visual_db,
        }

    # D. Klakson Kendaraan (nada stabil & kuat di pita 320-1200 Hz)
    if low_mid >= 0.55 and spectral_peak_ratio >= 0.16 and freq_variation < 90.0:
        return {
            "detected": True,
            "category": "klakson",
            "sound_type": "Klakson Kendaraan",
            "severity": "danger",
            "confidence": round(min(0.95, 0.74 + spectral_peak_ratio * 0.4), 2),
            "decibel_level": visual_db,
        }

    # E. Teriakan / Panggilan Keras (broadband vokal kuat)
    if (low_mid + siren_band) >= 0.65 and visual_db >= 65:
        return {
            "detected": True,
            "category": "teriakan",
            "sound_type": "Teriakan / Panggilan Keras",
            "severity": "danger" if visual_db >= 85 else "warning",
            "confidence": 0.78,
            "decibel_level": visual_db,
        }

    # F. Suara Keras Lingkungan umum
    return {
        "detected": True,
        "category": "bising",
        "sound_type": "Suara Keras Lingkungan",
        "severity": "danger" if visual_db >= 85 else "warning",
        "confidence": 0.72,
        "decibel_level": visual_db,
    }
