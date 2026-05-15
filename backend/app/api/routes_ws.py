import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.deps import get_app_settings, get_pipeline
from app.config import Settings
from app.core.pipeline import AvatarPipeline
from app.services.stt import create_stt_provider

router = APIRouter(tags=["websocket"])


def _default_audio_meta() -> dict:
    return {
        "content_type": "audio/webm",
        "filename": "audio.webm",
        "language": "auto",
    }


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    settings: Settings = Depends(get_app_settings),
    pipeline: AvatarPipeline = Depends(get_pipeline),
) -> None:
    await websocket.accept()
    audio_buffer = bytearray()
    audio_meta = _default_audio_meta()
    current_persona: str | None = None
    current_language: str = "auto"
    include_audio: bool = True

    async def send_json(payload: dict) -> None:
        await websocket.send_text(json.dumps(payload))

    await send_json({"type": "status", "state": "ready"})

    try:
        while True:
            message = await websocket.receive()

            if message.get("bytes") is not None:
                audio_buffer.extend(message["bytes"])
                continue

            if message.get("text") is None:
                continue

            raw = message["text"]
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_json({"type": "error", "message": "Invalid JSON payload."})
                continue

            msg_type = data.get("type")

            if msg_type == "chat":
                if data.get("persona"):
                    current_persona = data.get("persona")
                if data.get("language"):
                    current_language = data.get("language")
                if data.get("include_audio") is not None:
                    include_audio = bool(data.get("include_audio"))
                response = await pipeline.respond(
                    message=data.get("message", ""),
                    persona_id=current_persona,
                    language=current_language,
                    include_audio=include_audio,
                )
                await send_json(
                    {
                        "type": "transcript",
                        "role": "assistant",
                        "text": response["text"],
                    }
                )
                if response.get("audio_base64"):
                    await send_json(
                        {
                            "type": "audio",
                            "audioBase64": response["audio_base64"],
                            "contentType": "audio/mpeg",
                        }
                    )
                await send_json(
                    {
                        "type": "metadata",
                        "emotion": response.get("emotion"),
                        "gesture": response.get("gesture"),
                        "llm_provider": response.get("llm_provider"),
                        "tts_provider": response.get("tts_provider"),
                    }
                )
                continue

            if msg_type == "stt_start":
                audio_buffer = bytearray()
                audio_meta = {
                    "content_type": data.get("content_type") or "audio/webm",
                    "filename": data.get("filename") or "audio.webm",
                    "language": data.get("language") or "auto",
                }
                if data.get("persona"):
                    current_persona = data.get("persona")
                if data.get("language"):
                    current_language = data.get("language")
                if data.get("include_audio") is not None:
                    include_audio = bool(data.get("include_audio"))
                await send_json({"type": "stt_status", "state": "recording"})
                continue

            if msg_type == "stt_commit":
                if not audio_buffer:
                    await send_json({"type": "stt_status", "state": "empty"})
                    continue

                provider = create_stt_provider(settings.stt_provider, settings)
                result = await provider.transcribe(
                    audio=bytes(audio_buffer),
                    filename=audio_meta["filename"],
                    content_type=audio_meta["content_type"],
                    language=audio_meta["language"],
                )
                audio_buffer = bytearray()
                await send_json(
                    {
                        "type": "transcript",
                        "role": "user",
                        "text": result.transcript,
                    }
                )
                if result.transcript.strip():
                    response = await pipeline.respond(
                        message=result.transcript,
                        persona_id=current_persona,
                        language=current_language,
                        include_audio=include_audio,
                    )
                    await send_json(
                        {
                            "type": "transcript",
                            "role": "assistant",
                            "text": response["text"],
                        }
                    )
                    if response.get("audio_base64"):
                        await send_json(
                            {
                                "type": "audio",
                                "audioBase64": response["audio_base64"],
                                "contentType": "audio/mpeg",
                            }
                        )
                await send_json(
                    {
                        "type": "stt_status",
                        "state": "complete",
                        "provider": result.provider,
                    }
                )
                continue

            if msg_type == "ping":
                await send_json({"type": "pong"})
                continue

            await send_json({"type": "error", "message": "Unknown message type."})

    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await send_json({"type": "error", "message": str(exc)})
        except RuntimeError:
            pass
