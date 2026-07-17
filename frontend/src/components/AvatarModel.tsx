"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioStore } from "@/store/useAudioStore";
import { useAppStore } from "@/store/useAppStore";
import { useBlink } from "@/hooks/useBlink";
import { getAudioTime } from "@/lib/audioEngine";
import { lipsyncTrack, VISEME_MORPH_TARGETS } from "@/lib/lipsync";

const ALL_VISEME_MORPHS = Object.values(VISEME_MORPH_TARGETS);

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
  const { actions } = useAnimations(animations, groupRef);
  const blink = useBlink();

  // Cloned so two personas sharing one GLB get independent morph state.
  const model = useMemo(() => scene.clone(true), [scene]);

  const headRef = useRef<THREE.Object3D | null>(null);
  const baseHeadRotation = useRef<THREE.Euler | null>(null);

  useEffect(() => {
    if (animations.length > 0) {
      const first = animations[0]?.name;
      if (first) {
        actions[first]?.reset().fadeIn(0.4).play();
      }
    }

    model.traverse((child) => {
      if (child.type === "Bone" && !headRef.current && child.name.toLowerCase().includes("head")) {
        headRef.current = child;
        baseHeadRotation.current = child.rotation.clone();
      }
    });

    return () => {
      const first = animations[0]?.name;
      if (first) {
        actions[first]?.fadeOut(0.2);
      }
    };
  }, [actions, animations, model]);

  const morphMeshes = useMemo(() => {
    const meshes: MorphMesh[] = [];
    model.traverse((child) => {
      const mesh = child as MorphMesh;
      if ((child as THREE.Mesh).isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        meshes.push(mesh);
      }
    });
    return meshes;
  }, [model]);

  // Per-frame animation state is held in refs, never React state: this runs at 60fps.
  const visemeWeights = useRef(new Map<string, number>());
  const jawValue = useRef(0);
  const mouthValue = useRef(0);
  const blinkValue = useRef(0);
  const expressionWeights = useRef(new Map<string, number>());

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();
    // Frame-rate independent smoothing: a fast machine shouldn't snap harder than a slow one.
    const smooth = (rate: number) => 1 - Math.exp(-rate * delta);

    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.2) * 0.06;
      groupRef.current.position.y = Math.sin(t * 0.6) * 0.015;
    }

    // Read stores imperatively so this component never re-renders per frame.
    const { amplitude } = useAudioStore.getState();
    const emotion = useAppStore.getState().emotion;

    const sample = lipsyncTrack.sample(getAudioTime());
    const usingTimeline = lipsyncTrack.hasTimeline();

    // Decay every viseme toward zero, then raise the ones this instant calls for.
    const decay = smooth(22);
    ALL_VISEME_MORPHS.forEach((morph) => {
      const current = visemeWeights.current.get(morph) ?? 0;
      if (current > 0.001) {
        visemeWeights.current.set(morph, current * (1 - decay));
      } else if (current !== 0) {
        visemeWeights.current.set(morph, 0);
      }
    });

    sample.weights.forEach((weight, viseme) => {
      const morph = VISEME_MORPH_TARGETS[viseme];
      if (!morph) {
        return;
      }
      const current = visemeWeights.current.get(morph) ?? 0;
      visemeWeights.current.set(morph, Math.max(current, weight * LIPSYNC.viseme));
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

    // Speaking adds a little head motion; idle keeps a slow drift so it never looks frozen.
    if (headRef.current && baseHeadRotation.current) {
      const speaking = sample.active || amplitude > 0.05;
      const nod = Math.sin(t * (speaking ? 4.5 : 1.6)) * (speaking ? 0.045 : 0.012);
      const tilt = Math.cos(t * (speaking ? 2.8 : 1.2)) * (speaking ? 0.03 : 0.008);
      headRef.current.rotation.x +=
        (baseHeadRotation.current.x + nod - headRef.current.rotation.x) * smooth(6);
      headRef.current.rotation.z +=
        (baseHeadRotation.current.z + tilt - headRef.current.rotation.z) * smooth(6);
    }

    morphMeshes.forEach((mesh) => {
      visemeWeights.current.forEach((value, morph) => setMorph(mesh, morph, value));
      expressionWeights.current.forEach((value, morph) => setMorph(mesh, morph, value));
      setMorph(mesh, "jawOpen", jawValue.current);
      setMorph(mesh, "mouthOpen", mouthValue.current);
      setMorph(mesh, "eyeBlinkLeft", blinkValue.current);
      setMorph(mesh, "eyeBlinkRight", blinkValue.current);
    });
  });

  return <primitive ref={groupRef} object={model} position={[0, -1.9, 0]} />;
};

useGLTF.preload("/avatars/hod.glb");
