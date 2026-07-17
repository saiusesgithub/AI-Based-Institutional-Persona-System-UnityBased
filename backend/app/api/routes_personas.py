from fastapi import APIRouter, Depends

from app.api.deps import get_app_settings, get_persona_service
from app.config import Settings
from app.services.persona_service import PersonaService

router = APIRouter(tags=["personas"])


@router.get("/personas")
async def list_personas(
    settings: Settings = Depends(get_app_settings),
    persona_service: PersonaService = Depends(get_persona_service),
) -> dict:
    """Persona roster for the client: who exists, which model to load, how to theme them.

    System prompts and voice ids are deliberately withheld.
    """
    return {
        "default": settings.default_persona,
        "personas": [persona.as_public_dict() for persona in persona_service.list_personas()],
    }
