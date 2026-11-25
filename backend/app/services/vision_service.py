import hashlib
import io
import logging
import time
import urllib.request
from pathlib import Path
from typing import Any, Optional

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import BASE_DIR, settings

logger = logging.getLogger(__name__)

DEBUG_LAST_FRAME_PATH = BASE_DIR / "debug_last_frame.jpg"
DEBUG_LAST_ROI_PATH = BASE_DIR / "debug_last_roi.jpg"
MAX_INPUT_SIDE = 640

HAND_LANDMARKER_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

FINGER_ANGLE_TRIPLETS: list[tuple[int, int, int]] = [
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
USE_ROI_CROP: bool = True

MOCK_ALPHABET: list[str] = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def _create_gated_multimodal_model(
    n_classes: int,
    lm_dim: int = 156,
    backbone_name: str = "convnext_tiny",
    pretrained: bool = False,
) -> Any:
    """Arsitektur GatedMultimodalSignModel — identik 100% dengan notebook testing."""
    import torch
    import torch.nn as nn
    import torchvision.models as models

    class GatedMultimodalSignModel(nn.Module):
        def __init__(
            self,
            _n_classes: int,
            _lm_dim: int = 156,
            _backbone_name: str = "convnext_tiny",
            _pretrained: bool = False,
        ) -> None:
            super().__init__()
            backbone = models.convnext_tiny(weights=None)
            vis_out_dim = 768
            self.backbone = backbone.features
            self.vis_pool = nn.AdaptiveAvgPool2d((1, 1))

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
            v_raw = self.vis_pool(self.backbone(img))
            v_feat = self.vis_proj(v_raw)
            l_feat = self.lm_encoder(lm)
            concat_raw = torch.cat([v_feat, l_feat], dim=1)
            gate = self.vis_gate(concat_raw)
            v_attended = v_feat * gate
            fused = torch.cat([v_attended, l_feat], dim=1)
            return self.classifier(fused)

    return GatedMultimodalSignModel(
        _n_classes=n_classes,
        _lm_dim=lm_dim,
        _backbone_name=backbone_name,
        _pretrained=pretrained,
    )


def compute_hand_geometry(pts_21x3: np.ndarray) -> np.ndarray:
    """Identik 100% dengan fungsi compute_hand_geometry pada notebook testing."""
    if not np.any(pts_21x3):
        return np.zeros(15, dtype=np.float32)
    angles = []
    for a, b, c in FINGER_ANGLE_TRIPLETS:
        v1 = pts_21x3[a] - pts_21x3[b]
        v2 = pts_21x3[c] - pts_21x3[b]
        norm1 = np.linalg.norm(v1) + 1e-6
        norm2 = np.linalg.norm(v2) + 1e-6
        angles.append(np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0))
    palm_scale = np.linalg.norm(pts_21x3[9] - pts_21x3[0]) + 1e-6
    tip_dists = [
        np.linalg.norm(pts_21x3[tip] - pts_21x3[0]) / palm_scale
        for tip in FINGERTIP_INDICES
    ]
    return np.array(angles + tip_dists, dtype=np.float32)


def crop_hand_roi(
    pil_img: Image.Image,
    raw_hands_list: list[np.ndarray],
    margin: float = 0.25,
) -> Image.Image:
    """Square ROI crop identik 100% dengan notebook testing."""
    if not raw_hands_list:
        return pil_img
    w, h = pil_img.size
    all_pts = np.concatenate(raw_hands_list, axis=0)
    xs, ys = all_pts[:, 0] * w, all_pts[:, 1] * h
    x_min, x_max = max(0.0, float(xs.min())), min(float(w), float(xs.max()))
    y_min, y_max = max(0.0, float(ys.min())), min(float(h), float(ys.max()))
    side = max(x_max - x_min, y_max - y_min, 32.0) * (1.0 + 2 * margin)
    cx, cy = (x_min + x_max) / 2.0, (y_min + y_max) / 2.0
    left = int(max(0.0, cx - side / 2.0))
    top = int(max(0.0, cy - side / 2.0))
    right = int(min(float(w), cx + side / 2.0))
    bottom = int(min(float(h), cy + side / 2.0))
    if right - left < 20 or bottom - top < 20:
        return pil_img
    return pil_img.crop((left, top, right, bottom))


def extract_hand_features(
    img_rgb: np.ndarray,
    hands_detector: Any,
    mp_module: Any,
) -> tuple[Optional[np.ndarray], Optional[list[np.ndarray]]]:
    """Ekstraktor 156 fitur MediaPipe — identik 100% dengan notebook testing."""
    mp_image = mp_module.Image(
        image_format=mp_module.ImageFormat.SRGB,
        data=img_rgb,
    )
    results = hands_detector.detect(mp_image)
    if not results.hand_landmarks:
        return None, None

    slot_left = np.zeros((21, 3), dtype=np.float32)
    slot_right = np.zeros((21, 3), dtype=np.float32)
    geom_left = np.zeros(15, dtype=np.float32)
    geom_right = np.zeros(15, dtype=np.float32)
    raw_hands: list[np.ndarray] = []

    for idx, hand_lms in enumerate(results.hand_landmarks):
        arr = np.array([[l.x, l.y, l.z] for l in hand_lms], dtype=np.float32)
        raw_hands.append(arr.copy())
        geom = compute_hand_geometry(arr)
        rel = arr - arr[0].copy()
        rel /= np.linalg.norm(rel[:, :2], axis=1).max() + 1e-6
        handedness = (
            results.handedness[idx][0].category_name.lower()
            if idx < len(results.handedness)
            else "right"
        )
        if handedness == "left" and not np.any(slot_left):
            slot_left, geom_left = rel, geom
        elif handedness == "right" and not np.any(slot_right):
            slot_right, geom_right = rel, geom
        else:
            if not np.any(slot_left):
                slot_left, geom_left = rel, geom
            else:
                slot_right, geom_right = rel, geom

    feat_vec = np.concatenate(
        [slot_left.reshape(-1), slot_right.reshape(-1), geom_left, geom_right]
    ).astype(np.float32)
    return feat_vec, raw_hands


class BisindoVisionService:
    """
    Pipeline deteksi BISINDO identik 100% dengan notebook testing:
    ImageOps.exif_transpose -> MediaPipe HandLandmarker (156 dim) -> Square ROI Crop ->
    Resize(224,224) + ImageNet Normalize -> GatedMultimodalSignModel.
    """

    def _resolve_preferred_model_path(self, explicit_path: Optional[Path]) -> Path:
        if explicit_path is not None:
            return explicit_path
        best_path = BASE_DIR / "models" / "bisindo_convnext_tiny_gated_BEST.pth"
        if best_path.exists():
            logger.info("Memprioritaskan bobot model BEST: %s", best_path.name)
            return best_path
        return settings.resolved_model_path

    def __init__(
        self,
        model_path: Optional[Path] = None,
        landmarker_path: Optional[Path] = None,
        mock_mode: Optional[bool] = None,
    ) -> None:
        self.model_path: Path = self._resolve_preferred_model_path(model_path)
        self.landmarker_path: Path = (
            landmarker_path or settings.resolved_hand_landmarker_path
        )
        self.mock_mode_config: bool = (
            settings.AI_MOCK_MODE if mock_mode is None else mock_mode
        )
        self.device: Any = None
        self.model: Any = None
        self.landmarker: Any = None
        self.val_tf: Any = None
        self._mp: Any = None
        self.classes: list[str] = list(MOCK_ALPHABET)
        self.lm_dim: int = 156
        self.model_loaded: bool = False
        self.active_mode: str = "mock"
        self.last_good_angle: int = 0
        self.load_model()

    def _ensure_hand_landmarker_file(self) -> bool:
        if (
            self.landmarker_path.exists()
            and self.landmarker_path.stat().st_size > 100_000
        ):
            return True
        try:
            self.landmarker_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(
                "Mengunduh MediaPipe hand_landmarker.task ke %s...",
                self.landmarker_path,
            )
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
            import torchvision.transforms as T

            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            checkpoint = torch.load(
                str(self.model_path),
                map_location=self.device,
                weights_only=False,
            )

            self.classes = list(checkpoint["classes"])
            self.lm_dim = int(checkpoint["lm_dim"])
            backbone_name = str(checkpoint.get("backbone", "convnext_tiny"))

            model = _create_gated_multimodal_model(
                n_classes=len(self.classes),
                lm_dim=self.lm_dim,
                backbone_name=backbone_name,
                pretrained=False,
            ).to(self.device)
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            self.model = model

            self.val_tf = T.Compose(
                [
                    T.Resize((224, 224)),
                    T.ToTensor(),
                    T.Normalize(
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
                "Model BISINDO berhasil dimuat (%d kelas, lm_dim=%d, backbone=%s, device=%s).",
                len(self.classes),
                self.lm_dim,
                backbone_name,
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
    def validate_and_decode_image(image_bytes: bytes, mirror: bool = False) -> Image.Image:
        if not image_bytes:
            raise ValueError("Data gambar kosong.")
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img = ImageOps.exif_transpose(img).convert("RGB")
            if mirror:
                img = ImageOps.mirror(img)
            # Resize proporsional jika sisi terpanjang > 640px agar MediaPipe cepat & tajam
            w, h = img.size
            longest = max(w, h)
            if longest > MAX_INPUT_SIDE:
                scale = MAX_INPUT_SIDE / float(longest)
                img = img.resize(
                    (max(1, int(w * scale)), max(1, int(h * scale))),
                    Image.Resampling.LANCZOS,
                )
            return img
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
            "hands_detected": 1,
            "letter": MOCK_ALPHABET[idx1],
            "confidence": s1,
            "top3": [
                {"label": MOCK_ALPHABET[idx1], "score": s1},
                {"label": MOCK_ALPHABET[idx2], "score": s2},
                {"label": MOCK_ALPHABET[idx3], "score": s3},
            ],
            "mode": "mock",
        }

    @staticmethod
    def _apply_guide_roi(
        pil_img: Image.Image,
        roi_box: Optional[dict[str, float]],
    ) -> Image.Image:
        """Potong frame kamera sesuai koordinat bingkai panduan (0..1) dari frontend."""
        if not roi_box:
            return pil_img
        w, h = pil_img.size
        left = int(max(0.0, min(1.0, roi_box.get("x", 0.0))) * w)
        top = int(max(0.0, min(1.0, roi_box.get("y", 0.0))) * h)
        right = int(max(0.0, min(1.0, roi_box.get("x", 0.0) + roi_box.get("width", 1.0))) * w)
        bottom = int(max(0.0, min(1.0, roi_box.get("y", 0.0) + roi_box.get("height", 1.0))) * h)
        if right - left < 40 or bottom - top < 40:
            return pil_img
        return pil_img.crop((left, top, right, bottom))

    @staticmethod
    def _save_debug_image(pil_img: Image.Image, target: Path) -> None:
        try:
            pil_img.save(str(target), format="JPEG", quality=85)
        except Exception:
            pass

    def _run_model_inference(
        self,
        pil_img: Image.Image,
        feat_vec: np.ndarray,
        raw_hands: list[np.ndarray],
    ) -> tuple[list[dict[str, Any]], Image.Image]:
        """Inferensi ConvNeXt-Tiny + Landmark 156-dim identik 1:1 dengan Testing_V_03_BISINDO.ipynb."""
        import torch

        pil_roi = (
            crop_hand_roi(pil_img, raw_hands, margin=0.25)
            if USE_ROI_CROP
            else pil_img
        )
        img_tensor = self.val_tf(pil_roi).unsqueeze(0).to(self.device)
        lm_tensor = torch.from_numpy(feat_vec).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits = self.model(img_tensor, lm_tensor)
            probs = torch.softmax(logits, dim=1)[0]
            k = min(3, len(self.classes))
            top_scores, top_indices = torch.topk(probs, k=k)

        top3 = [
            {
                "label": self.classes[int(idx.item())],
                "score": round(float(score.item()), 4),
            }
            for score, idx in zip(top_scores, top_indices)
        ]
        return top3, pil_roi

    def predict_sign(
        self,
        image_bytes: bytes,
        roi_box: Optional[dict[str, float]] = None,
        mirror: bool = False,
    ) -> dict[str, Any]:
        """
        Pipeline 1:1 dengan Google Colab testing:
        Frame upright dari HTML5 <canvas> -> MediaPipe HandLandmarker (156 dim) ->
        Square ROI Crop (margin=0.25) -> Resize(224,224) + ImageNet Normalize -> ConvNeXt-Tiny.
        Tanpa rotasi paksa/multi-angle hack agar latensi inferensi < 200-300 ms.
        """
        _ = roi_box
        t0 = time.perf_counter()
        pil_img = self.validate_and_decode_image(image_bytes, mirror=mirror)

        if (
            self.active_mode == "model"
            and self.model_loaded
            and self.landmarker is not None
        ):
            img_rgb = np.ascontiguousarray(np.array(pil_img, dtype=np.uint8))
            feat_vec, raw_hands = extract_hand_features(
                img_rgb, self.landmarker, self._mp
            )

            if feat_vec is None or not raw_hands:
                elapsed_ms = (time.perf_counter() - t0) * 1000.0
                logger.info(
                    "[VISION] total=%.0fms | hands=0 | pred=- (0.00)",
                    elapsed_ms,
                )
                return {
                    "detected": False,
                    "hand_found": False,
                    "hands_detected": 0,
                    "letter": None,
                    "confidence": 0.0,
                    "top3": [],
                    "mode": "model",
                }

            top3, pil_roi = self._run_model_inference(pil_img, feat_vec, raw_hands)
            self._save_debug_image(pil_img, DEBUG_LAST_FRAME_PATH)
            self._save_debug_image(pil_roi, DEBUG_LAST_ROI_PATH)

            best = top3[0]
            hands_count = len(raw_hands)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            logger.info(
                "[VISION] total=%.0fms | hands=%d | pred=%s (%.2f)",
                elapsed_ms,
                hands_count,
                best["label"],
                best["score"],
            )
            return {
                "detected": True,
                "hand_found": True,
                "hands_detected": hands_count,
                "letter": best["label"],
                "confidence": best["score"],
                "top3": top3,
                "mode": "model",
            }

        self._save_debug_image(pil_img, DEBUG_LAST_FRAME_PATH)
        return self._mock_predict(image_bytes)

    def get_status(self) -> dict[str, Any]:
        return {
            "ai_mode": self.active_mode,
            "model_loaded": self.model_loaded,
        }


vision_service = BisindoVisionService()
