# AI Institutional Persona Backend

Clean FastAPI orchestration backend for a browser-based digital human. It handles persona-aware LLM responses, STT, TTS, and avatar metadata. The client (`frontend/`, Next.js + React Three Fiber) remains responsible for rendering, audio playback, gestures, emotions, and realtime lipsync.

This backend intentionally does not use Rhubarb, file-based lipsync, phoneme files, or video generation.

See `../CONTEXT.md` for the full system architecture and current status.

## Endpoints

- `GET /health`
- `POST /chat`
- `POST /chat/stream` — SSE-shaped, but not yet incremental (see CONTEXT.md gaps)
- `POST /stt`
- `POST /tts`
- `POST /avatar/respond`
- `WS /ws` — what the frontend actually uses; protocol documented in `../CONTEXT.md`

## Run locally

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# create .env with the keys listed under "Provider configuration" below
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the OpenAPI UI.

## Provider configuration

Provider selection is controlled by `.env`.

```env
LLM_PROVIDER=groq
LLM_FALLBACK_PROVIDER=gemini
STT_PROVIDER=groq_whisper
TTS_PROVIDER=elevenlabs
TTS_FALLBACK_PROVIDER=edge_tts
```

Required API keys depend on selected providers:

- `GROQ_API_KEY` for Groq chat and Groq Whisper STT
- `GEMINI_API_KEY` for Gemini fallback
- `ELEVENLABS_API_KEY` and persona `voice_id` for ElevenLabs TTS

`edge_tts` is meant as a development fallback. It does not require a cloned voice.

## Persona data

Personas live in `app/data/personas.json`.

Each persona can define:

- `id`
- `display_name`
- `role`
- `speaking_style`
- `system_prompt`
- `voice_id`
- `default_emotion`
- `default_gesture`

## Client contract

`POST /avatar/respond` accepts:

```json
{
  "message": "Tell me about placements.",
  "persona": "hod",
  "language": "auto",
  "include_audio": true
}
```

It returns text, optional base64 audio, provider names, emotion and gesture hints, and latency metrics.

For realtime lipsync, the browser client drives GLB morph targets from the played audio using Web Audio (`AnalyserNode` amplitude today; viseme-driven is planned).
