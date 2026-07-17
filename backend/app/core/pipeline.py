import base64
import time

from app.config import Settings
from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.core.visemes import timeline_as_dicts
from app.models.common import Emotion, Gesture, LatencyMetrics
from app.models.tts_models import TTSResponse
from app.services.llm import LLMProvider, LLMResponse, create_llm_provider
from app.services.persona_service import Persona, PersonaService
from app.services.tts import TTSProvider, TTSResult, create_tts_provider


class AvatarPipeline:
    def __init__(self, settings: Settings, persona_service: PersonaService):
        self._settings = settings
        self._persona_service = persona_service
        self._llm_provider = create_llm_provider(settings.llm_provider, settings)
        self._llm_fallback_provider = create_llm_provider(settings.llm_fallback_provider, settings)
        self._tts_provider = create_tts_provider(settings.tts_provider, settings)
        self._tts_fallback_provider = create_tts_provider(settings.tts_fallback_provider, settings)

    async def chat(
        self,
        message: str,
        persona_id: str | None,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
    ) -> tuple[LLMResponse, Persona]:
        persona = self._persona_service.get(persona_id)
        return await self._complete_with_fallback(message, persona, language, history), persona

    async def tts(self, text: str, persona_id: str | None, language: str = "auto") -> TTSResponse:
        persona = self._persona_service.get(persona_id)
        result = await self._synthesize_with_fallback(text, persona, language)
        return TTSResponse(
            audio_base64=base64.b64encode(result.audio).decode("ascii"),
            provider=result.provider,
            voice_id=result.voice_id,
            content_type=result.content_type,
            visemes=timeline_as_dicts(result.visemes),
        )

    async def respond(
        self,
        message: str,
        persona_id: str | None,
        language: str,
        include_audio: bool,
        history: list[dict[str, str]] | None = None,
    ) -> dict:
        total_start = time.perf_counter()
        persona = self._persona_service.get(persona_id)

        llm_start = time.perf_counter()
        llm_response = await self._complete_with_fallback(message, persona, language, history)
        llm_ms = _elapsed_ms(llm_start)

        text = _trim_for_speech(llm_response.text, self._settings.max_avatar_response_chars)
        emotion, gesture = infer_avatar_hints(text, persona)

        tts_ms: int | None = None
        tts_result: TTSResult | None = None
        if include_audio:
            tts_start = time.perf_counter()
            tts_result = await self._synthesize_with_fallback(text, persona, language)
            tts_ms = _elapsed_ms(tts_start)

        return {
            "text": text,
            "persona": persona.id,
            "audio_base64": (
                base64.b64encode(tts_result.audio).decode("ascii") if tts_result is not None else None
            ),
            "visemes": timeline_as_dicts(tts_result.visemes) if tts_result is not None else [],
            "emotion": emotion,
            "gesture": gesture,
            "llm_provider": llm_response.provider,
            "tts_provider": tts_result.provider if tts_result is not None else None,
            "latency": LatencyMetrics(
                llm_ms=llm_ms,
                tts_ms=tts_ms,
                total_ms=_elapsed_ms(total_start),
            ),
        }

    async def _complete_with_fallback(
        self,
        message: str,
        persona: Persona,
        language: str,
        history: list[dict[str, str]] | None = None,
    ) -> LLMResponse:
        try:
            return await self._llm_provider.complete(message, persona, language, history)
        except (ProviderConfigurationError, ProviderRuntimeError):
            response = await self._llm_fallback_provider.complete(message, persona, language, history)
            response.fallback_used = True
            return response

    async def _synthesize_with_fallback(self, text: str, persona: Persona, language: str = "auto") -> TTSResult:
        try:
            return await self._tts_provider.synthesize(text, persona, language)
        except (ProviderConfigurationError, ProviderRuntimeError):
            result = await self._tts_fallback_provider.synthesize(text, persona, language)
            result.fallback_used = True
            return result


def infer_avatar_hints(text: str, persona: Persona) -> tuple[Emotion, Gesture]:
    lowered = text.lower()
    if any(word in lowered for word in ["welcome", "hello", "namaste", "good morning", "good afternoon"]):
        return "welcoming", "greeting"
    if any(word in lowered for word in ["placement", "career", "opportunity", "success"]):
        return "encouraging", "explaining"
    if any(word in lowered for word in ["let me think", "consider", "depends"]):
        return "thinking", "thinking"
    if any(word in lowered for word in ["important", "must", "required", "deadline"]):
        return "serious", "explaining"
    return persona.default_emotion, persona.default_gesture if persona.default_gesture != "idle" else "speaking"


def _elapsed_ms(start: float) -> int:
    return round((time.perf_counter() - start) * 1000)


def _trim_for_speech(text: str, max_chars: int) -> str:
    normalized = " ".join(text.split())
    if len(normalized) <= max_chars:
        return normalized
    truncated = normalized[:max_chars].rsplit(" ", 1)[0]
    return f"{truncated}."
