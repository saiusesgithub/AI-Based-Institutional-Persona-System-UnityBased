# AI Institutional Persona System — Project Context

Single source of truth for what this project **is today**. Supersedes the old Unity PRD and
the separate frontend brief (both were contradictory and out of date; see History at the bottom).

---

## What this is

An AI-powered institutional digital human for college kiosk / demo use. A realistic 3D avatar
of an institutional persona (currently the HOD, **Dr. Obulesh**) listens to a visitor, answers
with an LLM, speaks in a cloned voice, and animates while talking.

It is a **realtime conversational avatar**. It is not a video-generation system.

## Stack — decided and in use

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router) + React 19, TypeScript, Tailwind 4 |
| 3D | React Three Fiber 9 + drei + three 0.184, GLB avatar with morph targets |
| State | Zustand |
| Transport | WebSocket (primary), REST available |
| Backend | Python 3.13 + FastAPI + Pydantic v2 + httpx |
| LLM | Groq primary (`llama-3.1-8b-instant`), Gemini fallback |
| STT | Groq Whisper (`whisper-large-v3-turbo`) |
| TTS | ElevenLabs primary (cloned voice), Edge TTS dev fallback |

**Unity was evaluated and dropped.** The system is browser-based: easier deploy, faster
iteration, simpler AI integration. The repo folder name still says "Unity" — ignore it. Any
doc, comment, or README that describes Unity as the client is stale.

Because the client is the browser, lipsync happens in the browser (Web Audio + morph targets),
not via SALSA/Oculus LipSync. Rhubarb is still rejected: it needs full audio, file writes, and
offline phoneme extraction, which defeats realtime.

---

## Architecture

```text
Browser (Next.js + R3F)                      FastAPI backend
─────────────────────────                    ────────────────────────
GET /personas ───────────────────────────►  persona roster (id, model_url, colour)
mic → MediaRecorder (webm/opus)
  └── binary chunks ──────► WS /ws ──► buffer
      {"type":"stt_start"}                   └─► Groq Whisper ──► transcript
      {"type":"stt_commit"}                      └─► Groq LLM + history (Gemini fallback)
                                                     └─► TTS with timing:
                                                         ElevenLabs /with-timestamps
                                                           → char alignment
                                                         Edge TTS WordBoundary
                                                           → word timings
                                                            └─► visemes.py → cue timeline
  ◄── {"type":"transcript"}  ◄──────────────────────┘
  ◄── {"type":"audio", base64 mp3, visemes:[{viseme,start,end}]}
  ◄── {"type":"metadata", emotion, gesture}
      │
      ├─► Web Audio decode → play; audio clock drives lipsyncTrack.sample(t)
      │      └─► 15 viseme morph targets + jaw coupling + coarticulation blending
      └─► AnalyserNode RMS amplitude → fallback mouth when no timeline
```

Lipsync is **timeline-driven, not amplitude-driven**. Amplitude only knows *how loud*; it can
never know *which sound*, which is why the old mouth flapped. The provider tells us when each
character or word is spoken, `visemes.py` maps those to mouth shapes, and the client samples
that timeline against the audio clock. Amplitude remains only as a fallback for providers
that report no timing.

API keys live only in the backend `.env`. The browser never sees them. Keep it that way.

### Repo layout

```text
backend/
  app/
    main.py              FastAPI app factory, CORS, router mounting
    config.py            pydantic-settings; every provider choice is env-driven
    api/
      deps.py            DI: settings, persona service, pipeline
      routes_health.py   GET  /health   → status + configured providers + persona ids
      routes_chat.py     POST /chat, POST /chat/stream (SSE)
      routes_stt.py      POST /stt      (multipart audio → transcript)
      routes_tts.py      POST /tts      (text → base64 audio)
      routes_avatar.py   POST /avatar/respond  (full pipeline, one call)
      routes_ws.py       WS   /ws       ← what the frontend actually uses
    core/
      pipeline.py        AvatarPipeline: LLM→TTS orchestration, fallbacks, emotion/gesture hints
      errors.py          provider errors → HTTP exceptions
    services/
      persona_service.py loads + validates personas.json
      llm/  base, factory, groq_provider, gemini_provider
      stt/  base, factory, groq_whisper_provider
      tts/  base, factory, elevenlabs_provider, edge_tts_provider
    data/personas.json   persona definitions (id, prompt, voice_id, defaults)

frontend/src/
  app/page.tsx, layout.tsx, globals.css
  components/
    MainView.tsx         wires socket + mic + UI; hold "A" = push-to-talk
    Stage.tsx, AvatarCanvas.tsx, StageOverlay.tsx
    AvatarModel.tsx      GLB load, morph targets, lipsync, procedural gestures
    TranscriptPanel.tsx, ControlsBar.tsx, ConnectionStatus.tsx
  hooks/
    useAvatarSocket.ts   WS message routing → store + audio playback
    useMicrophoneStream.ts  MediaRecorder capture and segmenting
    useBlink.ts
  lib/
    socketManager.ts     singleton WS, reconnect w/ backoff, send queue, heartbeat
    audioEngine.ts       base64 → decode → AnalyserNode → amplitude
  store/
    useAppStore.ts       connection, transcript, mic state, viseme
    useAudioStore.ts     amplitude, speaking
  public/avatars/
    hod.glb, avaturn.glb (~14 MB each, Avaturn T2)
```

Every provider sits behind a `base.py` interface plus a `factory.py`. Adding a provider means
adding one file and one factory entry — do not scatter provider logic into routes or pipeline.

---

## WebSocket protocol (`/ws`)

Client → server:

| Message | Purpose |
| --- | --- |
| binary frame | raw audio chunk, appended to the server-side buffer |
| `{"type":"stt_start", content_type, filename, language, persona, include_audio}` | reset buffer, set session options |
| `{"type":"stt_commit"}` | transcribe buffer, then run the full pipeline on the transcript |
| `{"type":"chat", message, persona, include_audio}` | text turn, skip STT |
| `{"type":"ping"}` | heartbeat (client sends every 15s) |

Server → client:

| Message | Purpose |
| --- | --- |
| `{"type":"status", state:"ready"}` | sent on connect |
| `{"type":"transcript", role:"user"\|"assistant", text}` | both sides of the turn |
| `{"type":"audio", audioBase64, contentType:"audio/mpeg"}` | full TTS clip |
| `{"type":"metadata", emotion, gesture, llm_provider, tts_provider}` | animation hints |
| `{"type":"stt_status", state:"recording"\|"processing"\|"empty"\|"complete"\|"error"}` | mic UI |
| `{"type":"error", message}` | surfaced into the transcript panel |

## Avatar model

Avaturn T2 GLB, one baked animation clip (`avaturn_animation`), morph targets across
`Head_Mesh` (72), `Teeth_Mesh`, `Tongue_Mesh`, `Eye_Mesh`, `EyeAO_Mesh`, `Eyelash_Mesh`.

The head mesh carries the **full Oculus 15-viseme set** — `viseme_sil, PP, FF, TH, DD, kk,
CH, SS, nn, RR, aa, E, I, O, U` — plus ARKit-style expression shapes (`mouthSmile*`,
`brow*`, `eyeBlink*`, `jawOpen`, `cheekPuff`, …). Today the code only drives `mouthOpen`,
`jawOpen`, `eyeBlinkLeft/Right`, and 5 vowel visemes. The model is far ahead of the code.

Persona/emotion/gesture vocabulary the backend emits:

- emotions: `neutral, welcoming, happy, thinking, serious, encouraging`
- gestures: `idle, greeting, explaining, thinking, nodding, speaking`

The backend only sends hints. It never animates.

---

## Current state

**Working:** all REST endpoints + `GET /personas`; four personas with per-persona model,
voice and colour; Groq LLM with Gemini fallback; **conversation memory** per WS session;
**timeline-driven lipsync** across 15 visemes with coarticulation and jaw coupling;
ElevenLabs `with-timestamps` and Edge TTS `WordBoundary` both yielding real timings;
Groq Whisper STT; emotion hints driving facial expressions; persona switcher with
history isolation; blink; idle motion; reconnect + send queue.

**Remaining gaps** (roughly by impact):

1. **No VAD / turn detection.** `useMicrophoneStream` force-commits every `SEGMENT_MS`
   (1500ms) on a fixed interval, so speech is chopped mid-sentence, each fragment is
   transcribed separately, and each fragment triggers its own LLM+TTS response. Push-to-talk
   ("A" key) sidesteps this; free-running mic still suffers. **Biggest remaining defect.**
2. **No real streaming.** `LLMProvider.stream()` in `base.py` just yields the whole
   completion, so `/chat/stream` is SSE-shaped but not actually incremental. TTS audio is
   sent as one base64 blob, so perceived latency is LLM + TTS end-to-end (~1–3s).
3. **No knowledge base / RAG.** Personas are told not to invent facts, but there is no
   source of college-specific data, so they deflect to "ask the office" a lot.
4. **Emotion/gesture inference is keyword matching** over the response text
   (`infer_avatar_hints`), not classification. Gesture hints are still not consumed by the
   client (emotion is).
5. **Grapheme→viseme mapping is rule-based**, not true G2P. English spelling is not
   phonetic, so some shapes are approximations. It reads correctly because the *timings*
   are real; upgrading to a phoneme dictionary would sharpen it further.
6. **No tests anywhere**, backend or frontend.
7. **`.env.example` still missing** (README no longer references it).
8. **Two GLBs for four personas** — `chairman`/`reception` share `avaturn.glb`, and
   `hod`/`guide` share `hod.glb`. Distinct models are a drop-in `model_url` change.

## Priorities

1. VAD / proper turn-taking instead of the 1.5s interval commit
2. Real streaming: token streaming from Groq, chunked TTS playback
3. Better avatar models (see below) — one per persona
4. Knowledge base for college-specific answers
5. Consume gesture hints (emotion already drives expressions)
6. Tests

## Avatar models

Any GLB with the **Oculus viseme set** works with zero code changes — the lipsync engine is
model-agnostic. Drop the file in `frontend/public/avatars/` and point the persona's
`model_url` at it.

Sources, as of July 2026:

| Source | Visemes | Notes |
| --- | --- | --- |
| **Microsoft Rocketbox** | 15 visemes + 52 ARKit | MIT licensed, 115 professional rigged avatars. FBX — needs conversion to GLB. Best free option. |
| Avaturn | Same naming as current models | What the current two GLBs came from. Photo→3D scanning is why they look rough. |
| MetaPerson (Avatar SDK) | Yes | Positioned as the RPM replacement; commercial. |
| Mixamo | **None** | Body animation only — no facial rig. Useful for retargeting body motion. |
| Sketchfab | Rarely | Most listings have no face rig. Verify before committing. |

**Ready Player Me is dead** — Netflix acquired it and shut the public service down on
31 January 2026. The domain no longer resolves. Any doc or tutorial telling you to use
`models.readyplayer.me` is obsolete.

Checklist for any candidate model:

1. Open it in [gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com/) and confirm
   morph targets exist on the head mesh
2. Full `viseme_*` set (15), not just `mouthOpen`
3. Visemes on teeth and tongue meshes too, not only the head — otherwise it looks uncanny
4. Under ~10 MB (the current two are 14 MB each)
5. Standard bone names (`Hips`/`Spine`/`Head`) so Mixamo animations retarget

## Conventions

- Providers stay swappable via `.env`; never hardcode a provider outside its factory.
- API keys never leave the backend.
- Responses stay short and spoken-friendly — no markdown, no long lists, ~700 char cap
  (`MAX_AVATAR_RESPONSE_CHARS`).
- Backend sends hints; the client owns all animation.
- No Rhubarb, no offline phoneme files, no precomputed video, no temp files as a workflow.
- `frontend/AGENTS.md`: this Next.js version has breaking changes vs. common knowledge —
  read `frontend/node_modules/next/dist/docs/` before writing frontend code.

## Running it

```powershell
# backend
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# create .env — see backend/README.md for required keys
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000   # docs at /docs

# frontend
cd frontend
npm install
npm run dev                                                   # http://localhost:3000
```

Frontend env: `NEXT_PUBLIC_WS_URL` (default `ws://localhost:8000/ws`),
`NEXT_PUBLIC_AVATAR_MODEL` (default `/avatars/avaturn.glb`).

Mic needs a secure context — use `localhost` or HTTPS.

## History

- `CONTEXT.md` (original) — Unity client + FastAPI backend PRD. The backend half is still
  accurate and was built as specified; the Unity client never happened.
- `CONTEXT1.md` — frontend-only brief that reversed the Unity decision in favour of
  Next.js + R3F. That decision won.
- Both are folded into this document. Where they disagreed, the code is the tiebreaker.
