#!/usr/bin/env python3
"""
Script untuk memastikan seluruh aset model AI BISINDO tersedia di backend/models/:
1. Mengunduh otomatis MediaPipe hand_landmarker.task jika belum ada.
2. Memverifikasi keberadaan checkpoint PyTorch (.pth) dan dataset gloss (.jsonl).
"""

import urllib.request
from pathlib import Path

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
LANDMARKER_PATH = MODELS_DIR / "hand_landmarker.task"
MODEL_PTH_PATH = MODELS_DIR / "bisindo_convnext_tiny_gated_FINAL.pth"
DATASET_PATH = MODELS_DIR / "bisindo_gloss_conversation_dataset.jsonl"


def download_assets() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. MediaPipe Hand Landmarker
    if LANDMARKER_PATH.exists() and LANDMARKER_PATH.stat().st_size > 100_000:
        size_mb = LANDMARKER_PATH.stat().st_size / (1024 * 1024)
        print(f"[OK]   hand_landmarker.task sudah ada ({size_mb:.2f} MB).")
    else:
        print("[DOWN] Mengunduh hand_landmarker.task dari Google Storage...")
        urllib.request.urlretrieve(HAND_LANDMARKER_URL, str(LANDMARKER_PATH))
        size_mb = LANDMARKER_PATH.stat().st_size / (1024 * 1024)
        print(f"[OK]   Berhasil diunduh ke {LANDMARKER_PATH} ({size_mb:.2f} MB).")

    # 2. Checkpoint PyTorch BISINDO
    if MODEL_PTH_PATH.exists():
        size_mb = MODEL_PTH_PATH.stat().st_size / (1024 * 1024)
        print(f"[OK]   {MODEL_PTH_PATH.name} ditemukan ({size_mb:.2f} MB).")
    else:
        print(
            f"[WARN] {MODEL_PTH_PATH.name} belum ada di {MODELS_DIR}. "
            "Backend akan berjalan dalam mode fallback mock hingga file .pth ditaruh."
        )

    # 3. Dataset Gloss JSONL (opsional)
    if DATASET_PATH.exists():
        print(f"[OK]   {DATASET_PATH.name} ditemukan.")
    else:
        print(f"[INFO] {DATASET_PATH.name} tidak ditemukan (opsional, fallback ke rule-based).")


if __name__ == "__main__":
    download_assets()
