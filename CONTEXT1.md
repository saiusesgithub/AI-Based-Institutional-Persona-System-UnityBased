````md
# AI Institutional Persona System — Frontend 3D Avatar Module

## Project Overview

We are building an AI-powered Institutional Persona System.

The idea:
A realistic AI avatar (representing a faculty member / institutional persona) speaks to users in real time inside a web application.

The avatar should:
- look realistic
- speak using AI-generated voice
- lip sync while speaking
- support facial expressions and blinking
- feel immersive and modern

We decided NOT to use Unity because:
- web deployment is easier
- backend integration is easier
- faster iteration
- easier collaboration
- simpler AI integration

We are now building everything using:
- Next.js
- React
- Three.js / React Three Fiber
- GLB avatars

---

# IMPORTANT CURRENT STATUS

We already completed:
- realistic avatar generation using Avaturn T2
- exported GLB model
- verified blendshapes / visemes exist
- verified morph targets work

Blendshapes confirmed:
- mouthOpen
- jawOpen
- viseme_aa
- viseme_E
- viseme_I
- viseme_O
- viseme_U
- eyeBlinkLeft
- eyeBlinkRight
- etc

The avatar model is READY.

---

# YOUR TASKS

You are responsible ONLY for the frontend avatar system.

NOT backend.
NOT AI APIs.
NOT authentication.

Focus ONLY on:
- rendering avatar
- animations
- lip sync
- realtime visual behavior

---

# TECH STACK

Use:
- Next.js
- React Three Fiber
- Drei
- Three.js

Avoid:
- Unity
- Babylon.js
- Unreal
- heavy game-engine approaches

---

# REQUIRED FEATURES

## 1. Load GLB Avatar

Load provided Avaturn T2 GLB model.

Requirements:
- model should render correctly
- proper lighting
- proper scale
- orbit controls for debugging
- clean scene setup

Use:
- useGLTF()
- Canvas from @react-three/fiber
- Environment from drei

---

## 2. Detect Morph Targets / Blendshapes

Need utility functions to:
- print all morph target names
- access morphTargetInfluences
- map visemes

Example:
```js
mesh.morphTargetDictionary
mesh.morphTargetInfluences
````

Need reusable helper system.

---

## 3. Lip Sync System

Main feature.

Need:

* play audio
* animate mouth while speaking

Initial version can use:

* audio amplitude
* fake viseme mapping
* simple jawOpen / mouthOpen animation

Advanced version:

* viseme timing support later

IMPORTANT:
Do NOT hardcode for one blendshape only.
System should support:

* viseme_aa
* viseme_O
* viseme_E
* jawOpen
* mouthOpen

---

## 4. Idle Animations

Need subtle:

* blinking
* breathing
* eye movement
* head micro movement

Goal:
Avatar should never feel static.

---

## 5. Expression System

Need reusable expression controls:

* smile
* angry
* confused
* neutral

Should be callable like:

```js
setExpression("smile")
```

Internally control blendshapes.

---

## 6. Audio Integration Structure

Need architecture ready for:

* AI TTS audio stream
* realtime audio playback
* lipsync syncing

Do NOT implement backend APIs yet.
Just structure frontend cleanly.

---

# EXPECTED FOLDER STRUCTURE

Example:

```text
src/
 ├── components/
 │    ├── Avatar.jsx
 │    ├── Scene.jsx
 │    ├── LipSyncController.js
 │    ├── ExpressionController.js
 │
 ├── hooks/
 │    ├── useLipSync.js
 │    ├── useBlink.js
 │
 ├── utils/
 │    ├── morphTargets.js
 │    ├── visemeMap.js
```

---

# IMPORTANT ENGINEERING NOTES

## Avatar Model

Model source:

* Avaturn T2 GLB

This model HAS:

* blendshapes
* visemes
* facial morph targets

We already verified ~72 blendshapes exist.

---

## DO NOT

* do NOT rebuild avatar system from scratch
* do NOT use Unity
* do NOT use ReadyPlayerMe
* do NOT switch avatar provider
* do NOT overengineer physics systems

---

# PRIORITY ORDER

## Highest Priority

1. avatar rendering
2. morph target access
3. speaking animation

## Medium Priority

4. blinking
5. expressions

## Low Priority

6. advanced cinematic features

---

# END GOAL

We want:

* realistic AI avatar
* browser-based
* smooth talking animation
* deployable web app
* modern UI feel

Think:
ChatGPT + realistic digital human.

---

# OUTPUT EXPECTATIONS

Deliver:

* working React app
* modular avatar system
* clean reusable code
* easy API integration later
* performance-friendly implementation

```
```