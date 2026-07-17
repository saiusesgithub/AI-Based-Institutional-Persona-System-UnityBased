from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import get_app_settings, get_knowledge_service, get_persona_service, get_pipeline
from app.config import Settings
from app.core.errors import to_http_exception
from app.core.pipeline import AvatarPipeline, infer_avatar_hints
from app.models.chat_models import ChatRequest, ChatResponse
from app.services.knowledge_service import KnowledgeService
from app.services.llm import create_llm_provider
from app.services.persona_service import PersonaService

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, pipeline: AvatarPipeline = Depends(get_pipeline)) -> ChatResponse:
    try:
        llm_response, persona = await pipeline.chat(request.message, request.persona, request.language)
        emotion, gesture = infer_avatar_hints(llm_response.text, persona)
        return ChatResponse(
            response=llm_response.text,
            persona=persona.id,
            provider=llm_response.provider,
            emotion=emotion,
            gesture=gesture,
        )
    except Exception as exc:
        raise to_http_exception(exc) from exc


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    settings: Settings = Depends(get_app_settings),
    persona_service: PersonaService = Depends(get_persona_service),
    knowledge_service: KnowledgeService = Depends(get_knowledge_service),
) -> StreamingResponse:
    async def events():
        try:
            persona = persona_service.get(request.persona)
            provider = create_llm_provider(settings.llm_provider, settings)
            knowledge_context = knowledge_service.context_for(request.message)
            async for chunk in provider.stream(request.message, persona, request.language, None, knowledge_context):
                yield f"event: token\ndata: {chunk}\n\n"
            yield "event: done\ndata: [DONE]\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {exc}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
