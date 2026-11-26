from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Isyarat Kita API"
    APP_VERSION: str = "2.0.0"

    DATABASE_URL: str = "postgresql://postgres:password123@localhost:15432/isyarat_kita"

    SECRET_KEY: str = "isyarat-kita-super-secret-jwt-key-change-in-production-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 hari

    # AI BISINDO Vision & MediaPipe
    AI_MOCK_MODE: bool = False
    AI_MODEL_PATH: str = "models/bisindo_convnext_tiny_gated_FINAL.pth"
    AI_MODEL_URL: str | None = None
    HAND_LANDMARKER_PATH: str = "models/hand_landmarker.task"
    GLOSS_DATASET_PATH: str = "models/bisindo_gloss_conversation_dataset.jsonl"

    # STT (faster-whisper)
    STT_MODEL_SIZE: str = "tiny"

    # Hybrid NLP (Gemini API)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    LLM_API_URL: str | None = None
    LLM_API_KEY: str | None = None
    LLM_MODEL: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def _resolve(self, raw_path: str) -> Path:
        p = Path(raw_path)
        return p if p.is_absolute() else BASE_DIR / p

    @property
    def resolved_model_path(self) -> Path:
        return self._resolve(self.AI_MODEL_PATH)

    @property
    def resolved_hand_landmarker_path(self) -> Path:
        return self._resolve(self.HAND_LANDMARKER_PATH)

    @property
    def resolved_gloss_dataset_path(self) -> Path:
        return self._resolve(self.GLOSS_DATASET_PATH)


settings = Settings()
