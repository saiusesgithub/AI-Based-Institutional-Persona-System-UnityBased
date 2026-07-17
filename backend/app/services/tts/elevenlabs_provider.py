import base64
import logging

import httpx

from app.config import Settings
from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.core.visemes import CharAlignment, timeline_from_char_alignment
from app.services.persona_service import Persona
from app.services.tts.base import TTSProvider, TTSResult

logger = logging.getLogger(__name__)


class ElevenLabsTTSProvider(TTSProvider):
    name = "elevenlabs"

    def __init__(self, settings: Settings):
        self._api_key = settings.elevenlabs_api_key
        self._model_id = settings.elevenlabs_model_id
        self._output_format = settings.elevenlabs_output_format
        self._default_voice_id = settings.elevenlabs_default_voice_id
        self._timeout = settings.request_timeout_seconds

    async def synthesize(self, text: str, persona: Persona, language: str = "auto") -> TTSResult:
        # eleven_multilingual_v2 detects the language from the text itself, so `language`
        # needs no explicit handling here.
        if not self._api_key:
            raise ProviderConfigurationError("ELEVENLABS_API_KEY is required for ElevenLabs TTS")
        voice_id = persona.voice_id or self._default_voice_id
        if not voice_id:
            raise ProviderConfigurationError(
                f"Persona '{persona.id}' has no voice_id and ELEVENLABS_DEFAULT_VOICE_ID is unset"
            )

        # `with-timestamps` returns JSON (base64 audio + per-character alignment) rather
        # than raw audio bytes. The alignment is what makes real lipsync possible.
        endpoint = (
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps"
            f"?output_format={self._output_format}"
        )
        payload = {
            "text": text,
            "model_id": self._model_id,
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }
        headers = {"xi-api-key": self._api_key, "Accept": "application/json"}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(endpoint, json=payload, headers=headers)
                if response.status_code >= 400:
                    logger.error("elevenlabs error %s: %s", response.status_code, response.text[:500])
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderRuntimeError(f"ElevenLabs TTS request failed: {exc}") from exc

        try:
            data = response.json()
            audio = base64.b64decode(data["audio_base64"])
        except (ValueError, KeyError) as exc:
            raise ProviderRuntimeError(f"ElevenLabs returned an unreadable response: {exc}") from exc

        return TTSResult(
            audio=audio,
            provider=self.name,
            voice_id=voice_id,
            content_type="audio/mpeg",
            visemes=_extract_visemes(data),
        )


def _extract_visemes(data: dict) -> list:
    """Build a viseme timeline from the response alignment.

    `normalized_alignment` matches the text actually spoken (numbers expanded, etc.), so it
    aligns with the audio better than the raw `alignment` echo of the input text.
    """
    alignment = data.get("normalized_alignment") or data.get("alignment")
    if not isinstance(alignment, dict):
        logger.warning("elevenlabs response carried no alignment; lipsync will use amplitude")
        return []

    characters = alignment.get("characters")
    starts = alignment.get("character_start_times_seconds")
    ends = alignment.get("character_end_times_seconds")
    if not characters or not starts or not ends:
        return []

    return timeline_from_char_alignment(CharAlignment(characters, starts, ends))
