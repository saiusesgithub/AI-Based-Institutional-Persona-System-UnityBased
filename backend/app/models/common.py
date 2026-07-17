from typing import Literal

from pydantic import BaseModel, Field


class VisemeCue(BaseModel):
    """One mouth shape held over a span of the audio, in seconds from audio start."""

    viseme: str
    start: float
    end: float


Emotion = Literal["neutral", "welcoming", "happy", "thinking", "serious", "encouraging"]
Gesture = Literal["idle", "greeting", "explaining", "thinking", "nodding", "speaking"]


class LatencyMetrics(BaseModel):
    llm_ms: int | None = None
    stt_ms: int | None = None
    tts_ms: int | None = None
    total_ms: int = 0


class ProviderInfo(BaseModel):
    provider: str
    model: str | None = None
    fallback_used: bool = False


class ErrorResponse(BaseModel):
    detail: str = Field(..., examples=["Provider is not configured"])
