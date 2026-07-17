import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.deps import get_app_settings, get_pipeline
from app.config import Settings
from app.core.conversation import Conversation
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
    current_language: str = "auto"
    include_audio: bool = True
    # One conversation per connection: memory lives as long as the visitor's session.
    conversation = Conversation(persona_id=settings.default_persona)
    stt_provider = create_stt_provider(settings.stt_provider, settings)

    async def send_json(payload: dict) -> None:
        await websocket.send_text(json.dumps(payload))

    def apply_options(data: dict) -> None:
        nonlocal current_language, include_audio
        if data.get("persona"):
            # Switching persona clears history so the new persona doesn't inherit
            # things it never said.
            conversation.switch_persona(data["persona"])
        if data.get("language"):
            current_language = data["language"]
        if data.get("include_audio") is not None:
            include_audio = bool(data["include_audio"])

    async def run_turn(message: str) -> None:
        """Answer one user message: LLM → TTS → transcript, audio + visemes, metadata."""
        history = conversation.history()
        response = await pipeline.respond(
            message=message,
            persona_id=conversation.persona_id,
            language=current_language,
            include_audio=include_audio,
            history=history,
        )
        conversation.add("user", message)
        conversation.add("assistant", response["text"])

        await send_json({"type": "transcript", "role": "assistant", "text": response["text"]})
        if response.get("audio_base64"):
            await send_json(
                {
                    "type": "audio",
                    "audioBase64": response["audio_base64"],
                    "contentType": "audio/mpeg",
                    # Timed mouth shapes for this exact clip. Empty means the client
                    # should fall back to amplitude-driven motion.
                    "visemes": response.get("visemes", []),
                }
            )
        await send_json(
            {
                "type": "metadata",
                "persona": response.get("persona"),
                "emotion": response.get("emotion"),
                "gesture": response.get("gesture"),
                "llm_provider": response.get("llm_provider"),
                "tts_provider": response.get("tts_provider"),
            }
        )

    await send_json({"type": "status", "state": "ready", "persona": conversation.persona_id})

    try:
        while True:
            message = await websocket.receive()

            if message.get("bytes") is not None:
                audio_buffer.extend(message["bytes"])
                continue

            if message.get("text") is None:
                continue

            try:
                data = json.loads(message["text"])
            except json.JSONDecodeError:
                await send_json({"type": "error", "message": "Invalid JSON payload."})
                continue

            msg_type = data.get("type")

            if msg_type == "chat":
                apply_options(data)
                try:
                    await run_turn(data.get("message", ""))
                except Exception as exc:
                    logger.exception("chat turn failed")
                    await send_json({"type": "error", "message": str(exc)})
                continue

            if msg_type == "persona":
                apply_options(data)
                await send_json({"type": "status", "state": "ready", "persona": conversation.persona_id})
                continue

            if msg_type == "reset":
                conversation.reset()
                await send_json({"type": "status", "state": "ready", "persona": conversation.persona_id})
                continue

            if msg_type == "stt_start":
                audio_buffer = bytearray()
                content_type = (data.get("content_type") or "audio/webm").split(";")[0]
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
                apply_options(data)
                await send_json({"type": "stt_status", "state": "recording"})
                continue

            if msg_type == "stt_commit":
                if not audio_buffer:
                    await send_json({"type": "stt_status", "state": "empty"})
                    continue

                await send_json({"type": "stt_status", "state": "processing"})
                logger.info("stt commit: %d bytes", len(audio_buffer))
                try:
                    result = await stt_provider.transcribe(
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
                    audio_buffer = bytearray()

                transcript = result.transcript.strip()
                if not transcript:
                    await send_json({"type": "stt_status", "state": "empty"})
                    continue

                await send_json({"type": "transcript", "role": "user", "text": transcript})
                try:
                    await run_turn(transcript)
                except Exception as exc:
                    logger.exception("stt turn failed")
                    await send_json({"type": "error", "message": str(exc)})
                await send_json({"type": "stt_status", "state": "complete", "provider": result.provider})
                continue

            if msg_type == "ping":
                await send_json({"type": "pong"})
                continue

            await send_json({"type": "error", "message": "Unknown message type."})

    except WebSocketDisconnect:
        return
    except RuntimeError:
        # Starlette raises this when receive() is called after the peer has gone away.
        # That is a normal hangup, not a failure.
        return
    except Exception as exc:
        logger.exception("websocket failed")
        try:
            await send_json({"type": "error", "message": str(exc)})
        except RuntimeError:
            pass
