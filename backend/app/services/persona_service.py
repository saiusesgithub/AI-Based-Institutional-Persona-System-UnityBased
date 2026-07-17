import json
from pathlib import Path

from pydantic import BaseModel, Field

from app.config import Settings
from app.core.errors import PersonaNotFoundError
from app.models.common import Emotion, Gesture


class Persona(BaseModel):
    id: str
    display_name: str
    role: str
    speaking_style: str
    system_prompt: str
    voice_id: str | None = None
    default_emotion: Emotion = "neutral"
    default_gesture: Gesture = "idle"
    metadata: dict[str, str] = Field(default_factory=dict)

    # Client-facing presentation. The backend never renders; it only tells the client which
    # model to load, so dropping in a new avatar is a one-line change here.
    model_url: str = "/avatars/avaturn.glb"
    accent_color: str = "#6366f1"
    tagline: str = ""

    def as_public_dict(self) -> dict:
        """Persona fields safe to expose to the browser (no prompts, no voice ids)."""
        return {
            "id": self.id,
            "display_name": self.display_name,
            "role": self.role,
            "model_url": self.model_url,
            "accent_color": self.accent_color,
            "tagline": self.tagline,
            "default_emotion": self.default_emotion,
            "default_gesture": self.default_gesture,
        }


class PersonaService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._personas = self._load(settings.personas_path)

    def list_personas(self) -> list[Persona]:
        return list(self._personas.values())

    def get(self, persona_id: str | None = None) -> Persona:
        resolved_id = persona_id or self._settings.default_persona
        persona = self._personas.get(resolved_id)
        if persona is None:
            raise PersonaNotFoundError(f"Persona '{resolved_id}' was not found")
        return persona

    @staticmethod
    def _load(path: Path) -> dict[str, Persona]:
        with path.open("r", encoding="utf-8") as file:
            raw_personas = json.load(file)

        personas = [Persona.model_validate(item) for item in raw_personas]
        return {persona.id: persona for persona in personas}
