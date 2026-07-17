from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.services.persona_service import Persona


@dataclass(slots=True)
class LLMResponse:
    text: str
    provider: str
    model: str | None = None
    fallback_used: bool = False


LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "te": "Telugu"}


def language_instruction(language: str) -> str:
    if language == "auto":
        return "Use the user's language naturally."
    name = LANGUAGE_NAMES.get(language, language)
    return f"Respond only in {name}, in its native script."


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def complete(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
        knowledge_context: str = "",
    ) -> LLMResponse:
        """`history` is prior turns as {"role": "user"|"assistant", "content": str}."""
        raise NotImplementedError

    async def stream(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
        knowledge_context: str = "",
    ) -> AsyncIterator[str]:
        response = await self.complete(message, persona, language, history, knowledge_context)
        yield response.text
