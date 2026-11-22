import hashlib
import io
import logging
import urllib.request
from pathlib import Path
from typing import Any, Optional

from PIL import Image, UnidentifiedImageError

from app.core.config import settings

logger = logging.getLogger(__name__)

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

ANGLE_TRIPLETS: list[tuple[int, int, int]] = [
    (0, 1, 2),
    (1, 2, 3),
    (2, 3, 4),
    (0, 5, 6),
    (5, 6, 7),
    (0, 9, 10),
    (9, 10, 11),
    (0, 13, 14),
    (13, 14, 15),
    (0, 17, 18),
]

FINGERTIP_INDICES: list[int] = [4, 8, 12, 16, 20]

MOCK_ALPHABET: list[str] = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def _build_gated_multimodal_model(lm_dim: int, n_classes: int) -> Any:
    """
    Bangun arsitektur GatedMultimodalSignModel persis sesuai state_dict
    checkpoint bisindo_convnext_tiny_gated_FINAL.pth.
    """
    import torch
    import torch.nn as nn
    from torchvision.models import convnext_tiny

    class GatedMultimodalSignModel(nn.Module):
        def __init__(self, _lm_dim: int, _n_classes: int) -> None:
            super().__init__()
            self.backbone = convnext_tiny(weights=None).features
            self.vis_pool = nn.AdaptiveAvgPool2d((1, 1))
            vis_out_dim = 768

            self.vis_proj = nn.Sequential(
                nn.Flatten(),
                nn.LayerNorm(vis_out_dim),
                nn.Dropout(0.3),
                nn.Linear(vis_out_dim, 512),
                nn.GELU(),
                nn.BatchNorm1d(512),
            )

            self.lm_encoder = nn.Sequential(
                nn.LayerNorm(_lm_dim),
                nn.Linear(_lm_dim, 256),
                nn.GELU(),
                nn.BatchNorm1d(256),
                nn.Dropout(0.2),
                nn.Linear(256, 256),
                nn.GELU(),
                nn.BatchNorm1d(256),
            )

            self.vis_gate = nn.Sequential(
                nn.Linear(512 + 256, 512),
                nn.Sigmoid(),
            )

            self.classifier = nn.Sequential(
                nn.Dropout(0.4),
                nn.Linear(512 + 256, 512),
                nn.GELU(),
                nn.BatchNorm1d(512),
                nn.Dropout(0.3),
                nn.Linear(512, _n_classes),
            )

        def forward(self, img: Any, lm: Any) -> Any:
            v_feat = self.vis_proj(self.vis_pool(self.backbone(img)))
            l_feat = self.lm_encoder(lm)
            gate = self.vis_gate(torch.cat([v_feat, l_feat], dim=1))
            v_attended = v_feat * gate
            return self.classifier(torch.cat([v_attended, l_feat], dim=1))

    return GatedMultimodalSignModel(lm_dim, n_classes)


def _compute_hand_geometry(pts: Any) -> Any:
    """
    Hitung 15 fitur geometri per tangan:
    - 10 sudut kosinus jari dari ANGLE_TRIPLETS
    - 5 jarak ujung jari [4,8,12,16,20] ke wrist [0] dibagi palm_scale
    """
    import numpy as np

    angles: list[float] = []
    for a, b, c in ANGLE_TRIPLETS:
        v1 = pts[a] - pts[b]
        v2 = pts[c] - pts[b]
        denom = float(np.linalg.norm(v1) * np.linalg.norm(v2)) + 1e-6
        cos_val = float(np.dot(v1, v2) / denom)
        angles.append(float(np.clip(cos_val, -1.0, 1.0)))

    palm_scale = float(np.linalg.norm(pts[9] - pts[0])) + 1e-6
    tip_dists = [
        float(np.linalg.norm(pts[tip] - pts[0])) / palm_scale
        for tip in FINGERTIP_INDICES
    ]

    return np.array(angles + tip_dists, dtype=np.float32)


def _extract_156_landmarks(result: Any) -> Any:
    """
    Ekstrak vektor 156 dimensi dari hasil MediaPipe HandLandmarker:
    [slot_left (63), slot_right (63), geom_left (15), geom_right (15)]
    """
    import numpy as np

    slot_left = np.zeros((21, 3), dtype=np.float32)
    slot_right = np.zeros((21, 3), dtype=np.float32)
    geom_left = np.zeros(15, dtype=np.float32)
    geom_right = np.zeros(15, dtype=np.float32)

    left_filled = False
    right_filled = False

    hand_landmarks_list = result.hand_landmarks or []
    handedness_list = result.handedness or []

    for idx, hand_lms in enumerate(hand_landmarks_list[:2]):
        arr = np.array([[lm.x, lm.y, lm.z] for lm in hand_lms], dtype=np.float32)
        rel = arr - arr[0]
        scale = float(np.linalg.norm(rel[:, :2], axis=1).max()) + 1e-6
        norm_arr = rel / scale
        geom = _compute_hand_geometry(arr)

        hand_label = "right"
        if idx < len(handedness_list) and handedness_list[idx]:
            hand_label = (handedness_list[idx][0].category_name or "right").lower()

        if hand_label == "left" and not left_filled:
            slot_left = norm_arr
            geom_left = geom
            left_filled = True
        elif not right_filled:
            slot_right = norm_arr
            geom_right = geom
            right_filled = True
        elif not left_filled:
            slot_left = norm_arr
            geom_left = geom
            left_filled = True

    return np.concatenate(
        [
            slot_left.reshape(-1),
            slot_right.reshape(-1),
            geom_left,
            geom_right,
        ]
    ).astype(np.float32)


def _crop_hand_roi(image_rgb: Any, hand_landmarks_list: list[Any], margin: float = 0.25) -> Image.Image:
    """Crop area ROI tangan dengan margin 25% dari frame RGB."""
    height, width = image_rgb.shape[:2]
    xs: list[float] = []
    ys: list[float] = []

    for hand_lms in hand_landmarks_list:
        for lm in hand_lms:
            xs.append(lm.x * width)
            ys.append(lm.y * height)

    if not xs or not ys:
        return Image.fromarray(image_rgb)

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    box_w = max(x_max - x_min, 1.0)
    box_h = max(y_max - y_min, 1.0)

    pad_x = box_w * margin
    pad_y = box_h * margin

    x1 = max(0, int(x_min - pad_x))
    y1 = max(0, int(y_min - pad_y))
    x2 = min(width, int(x_max + pad_x))
    y2 = min(height, int(y_max + pad_y))

    if x2 <= x1 or y2 <= y1:
        return Image.fromarray(image_rgb)

    return Image.fromarray(image_rgb[y1:y2, x1:x2])


class BisindoVisionService:
    """
    Pipeline deteksi BISINDO:
    MediaPipe HandLandmarker (156-dim landmarks + ROI crop) + GatedMultimodalSignModel (ConvNeXt-Tiny).
    Otomatis fallback ke mode 'mock' jika AI_MOCK_MODE=true atau bobot .pth belum tersedia.
    """

    def __init__(
        self,
        model_path: Optional[Path] = None,
        landmarker_path: Optional[Path] = None,
        mock_mode: Optional[bool] = None,
    ) -> None:
        self.model_path: Path = model_path or settings.resolved_model_path
        self.landmarker_path: Path = landmarker_path or settings.resolved_hand_landmarker_path
        self.mock_mode_config: bool = (
            settings.AI_MOCK_MODE if mock_mode is None else mock_mode
        )
        self.device: Any = None
        self.model: Any = None
        self.landmarker: Any = None
        self.transform: Any = None
        self.classes: list[str] = list(MOCK_ALPHABET)
        self.lm_dim: int = 156
        self.model_loaded: bool = False
        self.active_mode: str = "mock"
        self.load_model()

    def _ensure_hand_landmarker_file(self) -> bool:
        if self.landmarker_path.exists() and self.landmarker_path.stat().st_size > 100_000:
            return True
        try:
            self.landmarker_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info("Mengunduh MediaPipe hand_landmarker.task ke %s...", self.landmarker_path)
            urllib.request.urlretrieve(HAND_LANDMARKER_URL, str(self.landmarker_path))
            return self.landmarker_path.exists()
        except Exception as exc:
            logger.warning("Gagal auto-download hand_landmarker.task: %s", exc)
            return False

    def load_model(self) -> None:
        if self.mock_mode_config:
            self.model_loaded = False
            self.active_mode = "mock"
            logger.info("VisionService berjalan dalam mode mock (AI_MOCK_MODE=true).")
            return

        if not self.model_path.exists():
            self.model_loaded = False
            self.active_mode = "mock"
            logger.warning(
                "Checkpoint PyTorch tidak ditemukan di '%s'. Fallback aman ke mode mock.",
                self.model_path,
            )
            return

        if not self._ensure_hand_landmarker_file():
            self.model_loaded = False
            self.active_mode = "mock"
            logger.warning(
                "File MediaPipe hand_landmarker.task belum tersedia di '%s'. Fallback ke mode mock.",
                self.landmarker_path,
            )
            return

        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision as mp_vision
            import torch
            from torchvision import transforms

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            checkpoint = torch.load(
                str(self.model_path),
                map_location=self.device,
                weights_only=False,
            )

            self.classes = list(checkpoint["classes"])
            self.lm_dim = int(checkpoint["lm_dim"])

            model = _build_gated_multimodal_model(
                lm_dim=self.lm_dim,
                n_classes=len(self.classes),
            )
            model.load_state_dict(checkpoint["model_state"])
            model.to(self.device)
            model.eval()
            self.model = model

            self.transform = transforms.Compose(
                [
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225],
                    ),
                ]
            )

            base_options = mp_python.BaseOptions(
                model_asset_path=str(self.landmarker_path)
            )
            options = mp_vision.HandLandmarkerOptions(
                base_options=base_options,
                running_mode=mp_vision.RunningMode.IMAGE,
                num_hands=2,
                min_hand_detection_confidence=0.35,
            )
            self.landmarker = mp_vision.HandLandmarker.create_from_options(options)
            self._mp = mp

            self.model_loaded = True
            self.active_mode = "model"
            logger.info(
                "Model BISINDO berhasil dimuat (%d kelas, lm_dim=%d, device=%s).",
                len(self.classes),
                self.lm_dim,
                self.device,
            )
        except Exception as exc:
            self.model = None
            self.landmarker = None
            self.model_loaded = False
            self.active_mode = "mock"
            logger.exception(
                "Gagal memuat pipeline PyTorch/MediaPipe (%s). Fallback ke mode mock.",
                exc,
            )

    @staticmethod
    def validate_and_decode_image(image_bytes: bytes) -> Image.Image:
        if not image_bytes:
            raise ValueError("Data gambar kosong.")
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img.verify()
            return Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except (UnidentifiedImageError, OSError) as exc:
            raise ValueError("Payload bukan format gambar yang valid.") from exc

    def _mock_predict(self, image_bytes: bytes) -> dict[str, Any]:
        digest = hashlib.sha256(image_bytes).digest()
        idx1 = digest[0] % len(MOCK_ALPHABET)
        idx2 = (idx1 + 3) % len(MOCK_ALPHABET)
        idx3 = (idx1 + 7) % len(MOCK_ALPHABET)

        s1 = round(0.90 + (digest[1] % 8) * 0.01, 2)
        s2 = round(max(0.01, (1.0 - s1) * 0.65), 2)
        s3 = round(max(0.01, 1.0 - s1 - s2), 2)

        return {
            "detected": True,
            "hand_found": True,
            "letter": MOCK_ALPHABET[idx1],
            "confidence": s1,
            "top3": [
                {"label": MOCK_ALPHABET[idx1], "score": s1},
                {"label": MOCK_ALPHABET[idx2], "score": s2},
                {"label": MOCK_ALPHABET[idx3], "score": s3},
            ],
            "mode": "mock",
        }

    def predict_sign(self, image_bytes: bytes) -> dict[str, Any]:
        pil_image = self.validate_and_decode_image(image_bytes)

        if self.active_mode == "model" and self.model_loaded and self.landmarker is not None:
            import numpy as np
            import torch

            image_rgb = np.ascontiguousarray(np.array(pil_image, dtype=np.uint8))
            mp_image = self._mp.Image(
                image_format=self._mp.ImageFormat.SRGB,
                data=image_rgb,
            )
            result = self.landmarker.detect(mp_image)

            if not result.hand_landmarks:
                return {
                    "detected": False,
                    "hand_found": False,
                    "letter": None,
                    "confidence": 0.0,
                    "top3": [],
                    "mode": "model",
                }

            lm_vec = _extract_156_landmarks(result)
            roi_pil = _crop_hand_roi(image_rgb, result.hand_landmarks, margin=0.25)

            img_tensor = self.transform(roi_pil).unsqueeze(0).to(self.device)
            lm_tensor = torch.from_numpy(lm_vec).unsqueeze(0).to(self.device)

            with torch.no_grad():
                logits = self.model(img_tensor, lm_tensor)
                probs = torch.softmax(logits, dim=-1)[0]
                k = min(3, len(self.classes))
                top_scores, top_indices = torch.topk(probs, k=k)

            top3 = [
                {
                    "label": self.classes[int(idx.item())],
                    "score": round(float(score.item()), 4),
                }
                for score, idx in zip(top_scores, top_indices)
            ]

            best = top3[0]
            return {
                "detected": True,
                "hand_found": True,
                "letter": best["label"],
                "confidence": best["score"],
                "top3": top3,
                "mode": "model",
            }

        return self._mock_predict(image_bytes)

    def get_status(self) -> dict[str, Any]:
        return {
            "ai_mode": self.active_mode,
            "model_loaded": self.model_loaded,
        }


vision_service = BisindoVisionService()
