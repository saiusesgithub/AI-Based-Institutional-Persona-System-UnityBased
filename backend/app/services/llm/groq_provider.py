import httpx

from app.config import Settings
from app.core.errors import ProviderConfigurationError, ProviderRuntimeError
from app.services.llm.base import LLMProvider, LLMResponse, language_instruction
from app.services.persona_service import Persona


class GroqLLMProvider(LLMProvider):
    name = "groq"

    def __init__(self, settings: Settings):
        self._api_key = settings.groq_api_key
        self._model = settings.groq_llm_model
        self._timeout = settings.request_timeout_seconds

    async def complete(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
    ) -> LLMResponse:
        if not self._api_key:
            raise ProviderConfigurationError("GROQ_API_KEY is required for Groq LLM")

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": self._system_prompt(persona, language)},
                *(history or []),
                {"role": "user", "content": message},
            ],
            "temperature": 0.4,
            "max_tokens": 220,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ProviderRuntimeError(f"Groq LLM request failed: {exc}") from exc

        data = response.json()
        text = data["choices"][0]["message"]["content"].strip()
        return LLMResponse(text=text, provider=self.name, model=self._model)

    @staticmethod
    def _system_prompt(persona: Persona, language: str) -> str:
        return (
            f"{persona.system_prompt}\n"
            f"Role: {persona.role}.\n"
            f"Speaking style: {persona.speaking_style}.\n"
            f"{language_instruction(language)}\n"
            "Keep the response suitable for spoken avatar delivery: short, clear, and natural."
        )
