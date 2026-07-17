from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.core.visemes import VisemeEvent
from app.services.persona_service import Persona


@dataclass(slots=True)
class TTSResult:
    audio: bytes
    provider: str
    voice_id: str | None = None
    content_type: str = "audio/mpeg"
    fallback_used: bool = False
    # Empty when the provider reports no timing; the client then falls back to
    # amplitude-driven mouth motion.
    visemes: list[VisemeEvent] = field(default_factory=list)


class TTSProvider(ABC):
    name: str

    @abstractmethod
    async def synthesize(self, text: str, persona: Persona, language: str = "auto") -> TTSResult:
        """`language` is an ISO code ("hi", "te", "en") or "auto"; providers that pick a
        voice per language use it, others may ignore it."""
        raise NotImplementedError

    async def stream(self, text: str, persona: Persona, language: str = "auto") -> AsyncIterator[bytes]:
        result = await self.synthesize(text, persona, language)
        yield result.audio
