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


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def complete(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
    ) -> LLMResponse:
        """`history` is prior turns as {"role": "user"|"assistant", "content": str}."""
        raise NotImplementedError

    async def stream(
        self,
        message: str,
        persona: Persona,
        language: str = "auto",
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        response = await self.complete(message, persona, language, history)
        yield response.text
