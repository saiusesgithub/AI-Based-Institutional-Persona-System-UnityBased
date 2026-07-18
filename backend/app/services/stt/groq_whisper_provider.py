import logging

import httpx

from app.config import Settings
from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.services.stt.base import STTProvider, STTResult


# Whisper biases recognition toward the vocabulary in `prompt`. Institution names, campus
# terms, and the personas' names are exactly the words it otherwise garbles.
DOMAIN_PROMPT = (
    "VJIT, Vidya Jyothi Institute of Technology, Hyderabad, JNTUH, Telangana, "
    "Dr. Obulesu, Dr. Srujana, Dr. Padmaja, Palla Rajeshwar Reddy, "
    "B.Tech, M.Tech, MBA, CSE, ECE, EEE, IT, Data Science, AI and ML, Civil, Mechanical, "
    "placements, admissions, hostel, campus, department, faculty, semester, fees, "
    "NAAC, NBA, autonomous, counselling, EAMCET, scholarship."
)


class GroqWhisperProvider(STTProvider):
    name = "groq_whisper"

    def __init__(self, settings: Settings):
        self._api_key = settings.groq_api_key
        self._model = settings.groq_stt_model
        self._timeout = settings.request_timeout_seconds
        self._logger = logging.getLogger(__name__)

    async def transcribe(self, audio: bytes, filename: str, content_type: str, language: str = "auto") -> STTResult:
        if not self._api_key:
            raise ProviderConfigurationError("GROQ_API_KEY is required for Groq Whisper STT")
        if not audio:
            raise ProviderRuntimeError("Audio payload is empty")

        data = {
            "model": self._model,
            "response_format": "json",
            # Deterministic decoding: sampling noise on short clips causes wild misreads.
            "temperature": "0",
            "prompt": DOMAIN_PROMPT,
        }
        if language and language != "auto":
            data["language"] = language

        files = {"file": (filename or "audio.webm", audio, content_type or "application/octet-stream")}
        headers = {"Authorization": f"Bearer {self._api_key}"}

        self._logger.info(
            "stt request: model=%s filename=%s content_type=%s bytes=%d",
            self._model,
            filename,
            content_type,
            len(audio),
        )

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    data=data,
                    files=files,
                    headers=headers,
                )
                if response.status_code >= 400:
                    self._logger.error("stt response: %s", response.text)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderRuntimeError(f"Groq Whisper request failed: {exc}") from exc

        payload = response.json()
        return STTResult(
            transcript=(payload.get("text") or "").strip(),
            language=payload.get("language") or language or "auto",
            provider=self.name,
        )
