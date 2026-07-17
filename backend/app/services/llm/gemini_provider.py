import httpx

from app.config import Settings
from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.services.llm.base import LLMProvider, LLMResponse, language_instruction
from app.services.persona_service import Persona


def _to_gemini_contents(history: list[dict[str, str]]) -> list[dict]:
    """Gemini calls the assistant role "model" and wraps text in `parts`."""
    return [
        {
            "role": "model" if turn.get("role") == "assistant" else "user",
            "parts": [{"text": turn.get("content", "")}],
        }
        for turn in history
        if turn.get("content")
    ]


class GeminiLLMProvider(LLMProvider):
    name = "gemini"

    def __init__(self, settings: Settings):
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model
        self._timeout = settings.request_timeout_seconds

    async def complete(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
    ) -> LLMResponse:
        if not self._api_key:
            raise ProviderConfigurationError("GEMINI_API_KEY is required for Gemini LLM")

        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent?key={self._api_key}"
        )
        payload = {
            "systemInstruction": {
                "parts": [{"text": self._system_prompt(persona, language)}],
            },
            "contents": [
                *_to_gemini_contents(history or []),
                {"role": "user", "parts": [{"text": message}]},
            ],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 220},
        }

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(endpoint, json=payload)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderRuntimeError(f"Gemini LLM request failed: {exc}") from exc

        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return LLMResponse(text=text, provider=self.name, model=self._model)

    @staticmethod
    def _system_prompt(persona: Persona, language: str) -> str:
        return (
            f"{persona.system_prompt}\n"
            f"Role: {persona.role}.\n"
            f"Speaking style: {persona.speaking_style}.\n"
            f"{language_instruction(language)}\n"
            "Keep answers concise and spoken-friendly. Avoid markdown unless asked."
        )
