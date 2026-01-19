from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[1]  # .../backend
ENV_PATH = BASE_DIR / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

    # LiveKit
    LIVEKIT_URL: str = "ws://127.0.0.1:7880/rtc"
    LIVEKIT_API_KEY: Optional[str] = None
    LIVEKIT_API_SECRET: Optional[str] = None
    DEFAULT_ROOM: str = "demo-room"

    # Azure OpenAI
    AZURE_OPENAI_ENDPOINT: Optional[str] = None
    AZURE_OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_API_VERSION: str = "2024-02-15-preview"
    AZURE_OPENAI_DEPLOYMENT: Optional[str] = None
    AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT: Optional[str] = None

    # Qdrant
    QDRANT_URL: str = "http://127.0.0.1:6333"
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION: str = "saudi_knowledge"

    # Hamsa
    HAMSA_API_KEY: Optional[str] = None
    HAMSA_STT_URL: Optional[str] = None
    HAMSA_TTS_URL: Optional[str] = None
    HAMSA_LANGUAGE: str = "ar"
    HAMSA_DIALECT: str = "ksa"
    HAMSA_SPEAKER: Optional[str] = None

settings = Settings()
