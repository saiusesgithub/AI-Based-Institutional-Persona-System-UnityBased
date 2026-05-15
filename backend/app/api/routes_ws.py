import json
import logging
import os
import tempfile

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.deps import get_app_settings, get_pipeline
from app.config import Settings
from app.core.pipeline import AvatarPipeline
from app.services.stt import create_stt_provider

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


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
                logger.debug("stt audio chunk received: %d bytes", len(message["bytes"]))
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
                raw_content_type = data.get("content_type") or "audio/webm"
                content_type = raw_content_type.split(";")[0]
                filename = data.get("filename") or "audio.webm"
                if content_type == "audio/ogg" and not filename.endswith(".ogg"):
                    filename = "audio.ogg"
                if content_type == "audio/webm" and not filename.endswith(".webm"):
                    filename = "audio.webm"
                audio_meta = {
                    "content_type": content_type,
                    "filename": filename,
                    "language": data.get("language") or "auto",
                }
                logger.info("stt start: %s (%s)", audio_meta["filename"], audio_meta["content_type"])
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
                    logger.warning("stt commit with empty buffer")
                    continue

                await send_json({"type": "stt_status", "state": "processing"})
                logger.info("stt commit: %d bytes", len(audio_buffer))
                logger.info("speech recognition started")
                provider = create_stt_provider(settings.stt_provider, settings)
                suffix = ".webm" if audio_meta["content_type"] == "audio/webm" else ".ogg"
                tmp_path = None
                try:
                    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                        tmp.write(audio_buffer)
                        tmp_path = tmp.name
                    logger.info("stt temp audio saved: %s", tmp_path)
                    result = await provider.transcribe(
                        audio=bytes(audio_buffer),
                        filename=audio_meta["filename"],
                        content_type=audio_meta["content_type"],
                        language=audio_meta["language"],
                    )
                except Exception as exc:
                    logger.exception("stt failed")
                    await send_json({"type": "stt_status", "state": "error", "message": str(exc)})
                    await send_json({"type": "error", "message": str(exc)})
                    audio_buffer = bytearray()
                    continue
                finally:
                    if tmp_path and os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                logger.info("transcript generated")
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
