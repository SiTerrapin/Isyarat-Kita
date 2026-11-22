#!/usr/bin/env python3
"""
Script helper untuk mengunduh model resmi MediaPipe Hand Landmarker (.task)
ke folder backend/models/hand_landmarker.task.
"""

import urllib.request
from pathlib import Path

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
BASE_DIR = Path(__file__).resolve().parent.parent
TARGET_PATH = BASE_DIR / "models" / "hand_landmarker.task"


def download_hand_landmarker(target: Path = TARGET_PATH) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 100_000:
        print(f"[OK] Model sudah tersedia di: {target}")
        return target

    print(f"[DOWNLOAD] Mengunduh hand_landmarker.task dari Google Storage...")
    urllib.request.urlretrieve(HAND_LANDMARKER_URL, str(target))
    size_mb = target.stat().st_size / (1024 * 1024)
    print(f"[DONE] Berhasil diunduh ke {target} ({size_mb:.2f} MB).")
    return target


if __name__ == "__main__":
    download_hand_landmarker()
