"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useAudioStore } from "@/store/useAudioStore";
import { useAppStore } from "@/store/useAppStore";
import { useBlink } from "@/hooks/useBlink";
import { getAudioTime } from "@/lib/audioEngine";
import { lipsyncTrack, VISEME_ALIASES, VISEME_IDS } from "@/lib/lipsync";
import { useDebugStore } from "@/store/useDebugStore";

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

const GAZE_MORPHS = [
  "eyeLookInLeft",
  "eyeLookInRight",
  "eyeLookOutLeft",
  "eyeLookOutRight",
  "eyeLookUpLeft",
  "eyeLookUpRight",
  "eyeLookDownLeft",
  "eyeLookDownRight",
];

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

  // SkeletonUtils.clone, NOT scene.clone(): a naive clone leaves skinned meshes bound to
  // the original skeleton, so animations play but the mesh never moves (T-pose forever).
  // Then auto-frame: vendors export at wildly different scales and origins, so measure the
  // model and normalize it to the framing the camera is aimed at (target y≈1.45, feet at
  // -1.9, height ≈3.4 world units) instead of trusting the file.
  const { model, baseFrame } = useMemo(() => {
    const cloned = cloneSkinned(scene);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const frame = { scale: 1, position: [0, 0, 0] as [number, number, number], nativeHeight: size.y };
    if (size.y > 0.0001) {
      const scale = 3.4 / size.y;
      frame.scale = scale;
      frame.position = [-center.x * scale, -1.9 - box.min.y * scale, -center.z * scale];
      cloned.scale.setScalar(scale);
      cloned.position.set(...frame.position);
    }
    return { model: cloned, baseFrame: frame };
  }, [scene]);

  const activePersonaId = useAppStore((state) => state.activePersonaId);
  useEffect(() => {
    useDebugStore.getState().setStats({
      personaId: activePersonaId,
      modelUrl,
      nativeHeight: baseFrame.nativeHeight,
      baseScale: baseFrame.scale,
      basePosition: baseFrame.position,
    });
  }, [activePersonaId, baseFrame, modelUrl]);

  // Both clip sets are offered to the mixer. A model's own baked idle is authored for that
  // exact body, so it wins as the resting loop; the shared mocap Talking clips still add
  // hand gestures during speech. Shared tracks aimed at bones this rig lacks (fingertip /
  // toe-tip helpers) are pruned, else three.js logs a warning per missing bone per clip.
  const clips = useMemo(() => {
    const nodeNames = new Set<string>();
    model.traverse((child) => nodeNames.add(child.name));
    // Rotation tracks only. Position/scale tracks in baked clips are authored in the source
    // tool's units and origin — played on a rig that disagrees, they teleport or rescale
    // the body out of the camera. Rotations are unit-free and safe on any matching rig.
    const sanitize = (clip: THREE.AnimationClip) => {
      const copy = clip.clone();
      copy.tracks = copy.tracks.filter(
        (track) => nodeNames.has(track.name.split(".")[0]) && track.name.endsWith(".quaternion"),
      );
      return copy;
    };
    return [...animations, ...sharedAnimations].map(sanitize).filter((clip) => clip.tracks.length > 0);
  }, [animations, sharedAnimations, model]);

  const { actions } = useAnimations(clips, groupRef);
  const idleName = animations[0]?.name ?? "Idle";
  const hasIdleClip = Boolean(actions[idleName]);
  const speakingClip = useRef(false);
  const activeTalking = useRef<string>("Talking_1");

  useEffect(() => {
    const entry = actions[idleName] ?? Object.values(actions)[0];
    entry?.reset().fadeIn(0.4).play();
    speakingClip.current = false;
    return () => {
      entry?.fadeOut(0.2);
    };
  }, [actions, idleName]);

  // Resolved once per model: viseme id → morph index for each mesh, tried against every
  // vendor naming (viseme_aa / aa / ih…), so lookup at 60fps is pure index math.
  const meshBindings = useMemo(() => {
    const bindings: {
      mesh: MorphMesh;
      visemes: Map<string, number>;
      expressions: Map<string, number>;
      gaze: Map<string, number>;
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
      const gaze = new Map<string, number>();
      GAZE_MORPHS.forEach((name) => {
        if (dict[name] !== undefined) {
          gaze.set(name, dict[name]);
        }
      });
      bindings.push({ mesh, visemes, expressions, gaze });
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
  // Where the eyes are aimed (-1..1 each axis), where they're heading, and when to retarget.
  const gazeState = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, nextShiftAt: 0 });
  const driftState = useRef({ target: 0, value: 0, nextShiftAt: 0 });

  useFrame((state, delta) => {
    const now = state.clock.getElapsedTime();
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
      const idle = actions[idleName];
      if (idle) {
        if (audiblySpeaking && !speakingClip.current) {
          // A different gesture clip per utterance keeps long demos from looking canned.
          const options = ["Talking_0", "Talking_1", "Talking_2"].filter((name) => actions[name]);
          if (options.length > 0) {
            activeTalking.current = options[Math.floor(Math.random() * options.length)];
            speakingClip.current = true;
            idle.fadeOut(0.3);
            actions[activeTalking.current]?.reset().fadeIn(0.3).play();
          }
        } else if (!audiblySpeaking && speakingClip.current && quietSeconds.current > 0.8) {
          speakingClip.current = false;
          actions[activeTalking.current]?.fadeOut(0.4);
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

    // Eye saccades: quick small darts most of the time, an occasional held side glance.
    // While speaking the gaze stays near centre — people look at who they're talking to.
    const gaze = gazeState.current;
    if (now >= gaze.nextShiftAt) {
      const speaking = speakingClip.current;
      const sideGlance = !speaking && Math.random() < 0.25;
      const range = speaking ? 0.25 : sideGlance ? 0.9 : 0.45;
      gaze.targetX = (Math.random() * 2 - 1) * range;
      gaze.targetY = (Math.random() * 2 - 1) * range * 0.4;
      gaze.nextShiftAt = now + (sideGlance ? 1.2 + Math.random() : 1.5 + Math.random() * 4);
    }
    gaze.x += (gaze.targetX - gaze.x) * smooth(12);
    gaze.y += (gaze.targetY - gaze.y) * smooth(12);

    // Slow whole-body reorientation so idle never reads as a statue on a turntable.
    const drift = driftState.current;
    if (now >= drift.nextShiftAt) {
      drift.target = (Math.random() * 2 - 1) * 0.06;
      drift.nextShiftAt = now + 7 + Math.random() * 8;
    }
    drift.value += (drift.target - drift.value) * smooth(0.8);

    // Calibration overlay adjustments layered on top of auto-framing (identity when the
    // panel has never been touched).
    const adjust = useDebugStore.getState().adjust;
    if (groupRef.current) {
      groupRef.current.rotation.y = drift.value + THREE.MathUtils.degToRad(adjust.rotYDeg);
      groupRef.current.scale.setScalar(baseFrame.scale * adjust.modelScale);
      groupRef.current.position.set(
        baseFrame.position[0] + adjust.modelX,
        baseFrame.position[1] + adjust.modelY,
        baseFrame.position[2],
      );
    }

    const targetExpression = EMOTION_EXPRESSIONS[emotion] ?? {};
    EXPRESSION_MORPHS.forEach((morph) => {
      const current = expressionWeights.current.get(morph) ?? 0;
      const target = targetExpression[morph] ?? 0;
      expressionWeights.current.set(morph, current + (target - current) * smooth(3));
    });

    // Split the gaze vector into the ARKit look morphs (both eyes track together).
    const lookLeft = Math.max(0, -gaze.x);
    const lookRight = Math.max(0, gaze.x);
    const lookUp = Math.max(0, gaze.y);
    const lookDown = Math.max(0, -gaze.y);
    const gazeValues: Record<string, number> = {
      eyeLookOutLeft: lookLeft,
      eyeLookInRight: lookLeft,
      eyeLookInLeft: lookRight,
      eyeLookOutRight: lookRight,
      eyeLookUpLeft: lookUp,
      eyeLookUpRight: lookUp,
      eyeLookDownLeft: lookDown,
      eyeLookDownRight: lookDown,
    };

    meshBindings.forEach(({ mesh, visemes, expressions, gaze: gazeMap }) => {
      gazeMap.forEach((index, name) => {
        mesh.morphTargetInfluences[index] = gazeValues[name] ?? 0;
      });
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

  // No position prop: placement is computed during auto-framing, and a prop here would
  // overwrite it every render.
  return <primitive ref={groupRef} object={model} />;
};

useGLTF.preload("/avatars/animations.glb");
