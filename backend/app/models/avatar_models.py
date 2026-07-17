from pydantic import BaseModel, Field

from app.models.common import Emotion, Gesture, LatencyMetrics, VisemeCue


class AvatarRespondRequest(BaseModel):
    message: str = Field(..., min_length=1)
    persona: str | None = None
    language: str = "auto"
    include_audio: bool = True


class AvatarRespondResponse(BaseModel):
    text: str
    persona: str
    audio_url: str | None = None
    audio_base64: str | None = None
    visemes: list[VisemeCue] = Field(default_factory=list)
    emotion: Emotion
    gesture: Gesture
    llm_provider: str
    tts_provider: str | None = None
    latency: LatencyMetrics
