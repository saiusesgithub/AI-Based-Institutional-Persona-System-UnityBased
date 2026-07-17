from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.core.visemes import timeline_from_words
from app.services.persona_service import Persona
from app.services.tts.base import TTSProvider, TTSResult

# edge-tts reports WordBoundary offsets in 100-nanosecond ticks.
TICKS_PER_SECOND = 10_000_000


class EdgeTTSProvider(TTSProvider):
    name = "edge_tts"

    def __init__(self, voice: str = "en-IN-NeerjaNeural"):
        self._voice = voice

    async def synthesize(self, text: str, persona: Persona) -> TTSResult:
        try:
            import edge_tts
        except ImportError as exc:
            raise ProviderConfigurationError("edge-tts package is required for Edge TTS fallback") from exc

        # Persona voices are ElevenLabs ids, which mean nothing to Edge. A persona may name
        # an Edge voice explicitly for dev use; otherwise fall back to the default.
        voice = persona.metadata.get("edge_voice", self._voice)

        try:
            # edge-tts defaults to SentenceBoundary, which is far too coarse to drive a
            # mouth. WordBoundary gives per-word offsets we can distribute into visemes.
            communicate = edge_tts.Communicate(text, voice=voice, boundary="WordBoundary")
            chunks: list[bytes] = []
            words: list[tuple[str, float, float]] = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    chunks.append(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    start = chunk["offset"] / TICKS_PER_SECOND
                    end = start + chunk["duration"] / TICKS_PER_SECOND
                    words.append((chunk["text"], start, end))
        except Exception as exc:
            raise ProviderRuntimeError(f"Edge TTS request failed: {exc}") from exc

        return TTSResult(
            audio=b"".join(chunks),
            provider=self.name,
            voice_id=voice,
            content_type="audio/mpeg",
            visemes=timeline_from_words(words),
        )
