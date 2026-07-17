from functools import lru_cache

from app.config import Settings, get_settings
from app.core.pipeline import AvatarPipeline
from app.services.knowledge_service import KnowledgeService
from app.services.persona_service import PersonaService


@lru_cache
def get_persona_service() -> PersonaService:
    return PersonaService(get_settings())


@lru_cache
def get_knowledge_service() -> KnowledgeService:
    return KnowledgeService(get_settings())


@lru_cache
def get_pipeline() -> AvatarPipeline:
    # Cached: constructing the pipeline builds four provider clients, which is pure waste
    # to repeat on every request.
    return AvatarPipeline(get_settings(), get_persona_service(), get_knowledge_service())


def get_app_settings() -> Settings:
    return get_settings()
