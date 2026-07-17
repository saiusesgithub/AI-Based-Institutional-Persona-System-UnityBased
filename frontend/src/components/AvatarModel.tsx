"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioStore } from "@/store/useAudioStore";
import { useAppStore } from "@/store/useAppStore";
import { useBlink } from "@/hooks/useBlink";
import { getAudioTime } from "@/lib/audioEngine";
import { lipsyncTrack, VISEME_ALIASES, VISEME_IDS } from "@/lib/lipsync";

/**
 * How far the mouth actually travels. Morph targets at weight 1.0 are extreme reference
 * poses, not conversational speech — driving them fully makes the avatar look like it is
 * shouting. Real speech is a small, fast mouth. Turn these up to exaggerate.
 */
const LIPSYNC = {
  viseme: 0.26,
  jaw: 0.09,
  mouthOpen: 0.02,
  /** Amplitude fallback when a provider gives no timing. */
  fallbackJaw: 0.1,
};

/** Expression morphs per emotion hint from the backend, as name → weight. */
const EMOTION_EXPRESSIONS: Record<string, Record<string, number>> = {
  neutral: {},
  welcoming: { mouthSmileLeft: 0.35, mouthSmileRight: 0.35, browInnerUp: 0.15 },
  happy: { mouthSmileLeft: 0.55, mouthSmileRight: 0.55, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 },
  thinking: { browDownLeft: 0.3, browDownRight: 0.3, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  serious: { browDownLeft: 0.25, browDownRight: 0.25, mouthPressLeft: 0.2, mouthPressRight: 0.2 },
  encouraging: { mouthSmileLeft: 0.4, mouthSmileRight: 0.4, browOuterUpLeft: 0.25, browOuterUpRight: 0.25 },
};

const EXPRESSION_MORPHS = Array.from(
  new Set(Object.values(EMOTION_EXPRESSIONS).flatMap((map) => Object.keys(map))),
);

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

const setMorph = (mesh: MorphMesh, name: string, value: number) => {
  const index = mesh.morphTargetDictionary[name];
  if (index === undefined) {
    return;
  }
  mesh.morphTargetInfluences[index] = value;
};

export const AvatarModel = ({ modelUrl }: { modelUrl: string }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(modelUrl);
  // Shared mocap clips (Idle, Talking_0..2). All our avatars use the same Mixamo-style
  // rig (Hips/Spine/LeftArm/Head), so one animation file drives every model — and none
  // of them ship their own clips, which is why they T-posed without this.
  const { animations: sharedAnimations } = useGLTF("/avatars/animations.glb");
  const blink = useBlink();

  // Cloned so two personas sharing one GLB get independent morph state.
  const model = useMemo(() => scene.clone(true), [scene]);

  const clips = animations.length > 0 ? animations : sharedAnimations;
  const { actions } = useAnimations(clips, groupRef);
  const hasIdleClip = Boolean(actions["Idle"]);
  const speakingClip = useRef(false);

  useEffect(() => {
    const entry = actions["Idle"] ?? Object.values(actions)[0];
    entry?.reset().fadeIn(0.4).play();
    speakingClip.current = false;
    return () => {
      entry?.fadeOut(0.2);
    };
  }, [actions]);

  // Resolved once per model: viseme id → morph index for each mesh, tried against every
  // vendor naming (viseme_aa / aa / ih…), so lookup at 60fps is pure index math.
  const meshBindings = useMemo(() => {
    const bindings: {
      mesh: MorphMesh;
      visemes: Map<string, number>;
      expressions: Map<string, number>;
    }[] = [];
    model.traverse((child) => {
      const mesh = child as MorphMesh;
      if (!(child as THREE.Mesh).isMesh || !mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
        return;
      }
      const dict = mesh.morphTargetDictionary;
      const visemes = new Map<string, number>();
      VISEME_IDS.forEach((id) => {
        const name = VISEME_ALIASES[id].find((alias) => dict[alias] !== undefined);
        if (name !== undefined) {
          visemes.set(id, dict[name]);
        }
      });
      const expressions = new Map<string, number>();
      EXPRESSION_MORPHS.forEach((name) => {
        if (dict[name] !== undefined) {
          expressions.set(name, dict[name]);
        }
      });
      bindings.push({ mesh, visemes, expressions });
    });
    return bindings;
  }, [model]);

  // Per-frame animation state is held in refs, never React state: this runs at 60fps.
  const visemeWeights = useRef(new Map<string, number>());
  const jawValue = useRef(0);
  const mouthValue = useRef(0);
  const blinkValue = useRef(0);
  const expressionWeights = useRef(new Map<string, number>());

  const quietSeconds = useRef(0);

  useFrame((state, delta) => {
    // Frame-rate independent smoothing: a fast machine shouldn't snap harder than a slow one.
    const smooth = (rate: number) => 1 - Math.exp(-rate * delta);

    // Read stores imperatively so this component never re-renders per frame.
    const { amplitude } = useAudioStore.getState();
    const emotion = useAppStore.getState().emotion;

    const sample = lipsyncTrack.sample(getAudioTime());
    const usingTimeline = lipsyncTrack.hasTimeline();

    // Crossfade Idle ↔ Talking with the audio. The hold-out before returning to Idle
    // stops the body twitching between clips during natural pauses in a sentence.
    if (hasIdleClip) {
      const audiblySpeaking = sample.active || amplitude > 0.05;
      quietSeconds.current = audiblySpeaking ? 0 : quietSeconds.current + delta;
      const talking = actions["Talking_1"] ?? actions["Talking_0"];
      const idle = actions["Idle"];
      if (talking && idle) {
        if (audiblySpeaking && !speakingClip.current) {
          speakingClip.current = true;
          idle.fadeOut(0.3);
          talking.reset().fadeIn(0.3).play();
        } else if (!audiblySpeaking && speakingClip.current && quietSeconds.current > 0.8) {
          speakingClip.current = false;
          talking.fadeOut(0.4);
          idle.reset().fadeIn(0.4).play();
        }
      }
    }

    // Decay every viseme toward zero, then raise the ones this instant calls for.
    const decay = smooth(22);
    VISEME_IDS.forEach((id) => {
      const current = visemeWeights.current.get(id) ?? 0;
      if (current > 0.001) {
        visemeWeights.current.set(id, current * (1 - decay));
      } else if (current !== 0) {
        visemeWeights.current.set(id, 0);
      }
    });

    sample.weights.forEach((weight, viseme) => {
      const current = visemeWeights.current.get(viseme) ?? 0;
      visemeWeights.current.set(viseme, Math.max(current, weight * LIPSYNC.viseme));
    });

    if (usingTimeline) {
      jawValue.current += (sample.jaw * LIPSYNC.jaw - jawValue.current) * smooth(18);
      mouthValue.current += (sample.jaw * LIPSYNC.mouthOpen - mouthValue.current) * smooth(18);
    } else {
      // No timing from the provider: fall back to the old amplitude-driven mouth so the
      // avatar still moves rather than sitting frozen.
      const target = Math.min(amplitude * LIPSYNC.fallbackJaw, 0.16);
      jawValue.current += (target - jawValue.current) * smooth(14);
      mouthValue.current += (target * 0.3 - mouthValue.current) * smooth(14);
    }

    blinkValue.current += (blink - blinkValue.current) * smooth(35);

    const targetExpression = EMOTION_EXPRESSIONS[emotion] ?? {};
    EXPRESSION_MORPHS.forEach((morph) => {
      const current = expressionWeights.current.get(morph) ?? 0;
      const target = targetExpression[morph] ?? 0;
      expressionWeights.current.set(morph, current + (target - current) * smooth(3));
    });

    meshBindings.forEach(({ mesh, visemes, expressions }) => {
      visemeWeights.current.forEach((value, id) => {
        const index = visemes.get(id);
        if (index !== undefined) {
          mesh.morphTargetInfluences[index] = value;
        }
      });
      expressionWeights.current.forEach((value, name) => {
        const index = expressions.get(name);
        if (index !== undefined) {
          mesh.morphTargetInfluences[index] = value;
        }
      });
      setMorph(mesh, "jawOpen", jawValue.current);
      setMorph(mesh, "mouthOpen", mouthValue.current);
      setMorph(mesh, "eyeBlinkLeft", blinkValue.current);
      setMorph(mesh, "eyeBlinkRight", blinkValue.current);
    });
  });

  return <primitive ref={groupRef} object={model} position={[0, -1.9, 0]} />;
};

useGLTF.preload("/avatars/hod.glb");
useGLTF.preload("/avatars/animations.glb");
