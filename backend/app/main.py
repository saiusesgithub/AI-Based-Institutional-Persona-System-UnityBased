from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_avatar import router as avatar_router
from app.api.routes_chat import router as chat_router
from app.api.routes_health import router as health_router
from app.api.routes_personas import router as personas_router
from app.api.routes_stt import router as stt_router
from app.api.routes_tts import router as tts_router
from app.api.routes_ws import router as ws_router
from app.config import get_settings
from app.core.logging_config import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Streaming-ready FastAPI orchestration backend for browser-based institutional personas.",
    )
    # Browsers reject `Access-Control-Allow-Origin: *` together with credentials, so only
    # ask for credentials when the origins are actually pinned.
    wildcard_origins = "*" in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=not wildcard_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router, prefix=settings.api_prefix)
    app.include_router(personas_router, prefix=settings.api_prefix)
    app.include_router(chat_router, prefix=settings.api_prefix)
    app.include_router(stt_router, prefix=settings.api_prefix)
    app.include_router(tts_router, prefix=settings.api_prefix)
    app.include_router(avatar_router, prefix=settings.api_prefix)
    app.include_router(ws_router, prefix=settings.api_prefix)
    return app


app = create_app()
