from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Institutional Persona Backend"
    environment: str = "development"
    api_prefix: str = ""

    llm_provider: str = Field(default="groq")
    llm_fallback_provider: str = Field(default="gemini")
    stt_provider: str = Field(default="groq_whisper")
    tts_provider: str = Field(default="elevenlabs")
    tts_fallback_provider: str = Field(default="edge_tts")

    groq_api_key: str | None = None
    groq_llm_model: str = "llama-3.1-8b-instant"
    groq_stt_model: str = "whisper-large-v3-turbo"

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"

    elevenlabs_api_key: str | None = None
    elevenlabs_model_id: str = "eleven_multilingual_v2"
    elevenlabs_output_format: str = "mp3_44100_128"
    # Used for personas that don't define their own cloned voice_id.
    elevenlabs_default_voice_id: str | None = None

    default_persona: str = "hod"
    personas_path: Path = Path(__file__).resolve().parent / "data" / "personas.json"

    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    request_timeout_seconds: float = 60.0
    max_avatar_response_chars: int = 700

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
