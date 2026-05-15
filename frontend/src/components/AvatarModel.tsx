"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useAudioStore } from "@/store/useAudioStore";
import { useAppStore } from "@/store/useAppStore";
import { useBlink } from "@/hooks/useBlink";

const VISemeFallback = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"];
const MOUTH_TARGETS = ["mouthOpen", "jawOpen"];

const setMorphValue = (mesh: THREE.Mesh, name: string, value: number) => {
  if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) {
    return;
  }
  const index = mesh.morphTargetDictionary[name];
  if (index === undefined) {
    return;
  }
  mesh.morphTargetInfluences[index] = value;
};

export const AvatarModel = () => {
  const groupRef = useRef<THREE.Group>(null);
  const modelUrl =
    process.env.NEXT_PUBLIC_AVATAR_MODEL || "/avatars/avaturn.glb";
  const { scene, animations } = useGLTF(modelUrl);
  const { actions } = useAnimations(animations, groupRef);
  const amplitude = useAudioStore((state) => state.amplitude);
  const viseme = useAppStore((state) => state.viseme);
  const blink = useBlink();

  useEffect(() => {
    if (animations.length > 0) {
      const first = animations[0].name;
      actions[first]?.reset().fadeIn(0.4).play();
      return;
    }

    const lowerArms = (bone: THREE.Object3D) => {
      const name = bone.name.toLowerCase();
      const rot = bone.rotation;

      if (name.includes("leftarm") || name.includes("leftupperarm") || name.includes("l_upperarm")) {
        rot.z = THREE.MathUtils.degToRad(10);
        rot.x = THREE.MathUtils.degToRad(-35);
      }
      if (name.includes("rightarm") || name.includes("rightupperarm") || name.includes("r_upperarm")) {
        rot.z = THREE.MathUtils.degToRad(-10);
        rot.x = THREE.MathUtils.degToRad(-35);
      }
      if (name.includes("leftforearm") || name.includes("leftlowerarm") || name.includes("l_lowerarm")) {
        rot.x = THREE.MathUtils.degToRad(-10);
        rot.y = THREE.MathUtils.degToRad(5);
      }
      if (name.includes("rightforearm") || name.includes("rightlowerarm") || name.includes("r_lowerarm")) {
        rot.x = THREE.MathUtils.degToRad(-10);
        rot.y = THREE.MathUtils.degToRad(-5);
      }
      if (name.includes("shoulder") && name.includes("left")) {
        rot.z = THREE.MathUtils.degToRad(6);
      }
      if (name.includes("shoulder") && name.includes("right")) {
        rot.z = THREE.MathUtils.degToRad(-6);
      }
    };

    scene.traverse((child) => {
      if (child.type === "Bone") {
        lowerArms(child);
      }
    });
  }, [actions, animations, scene]);

  const morphMeshes = useMemo(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
        meshes.push(child);
      }
    });
    return meshes;
  }, [scene]);

  const mouthValue = useRef(0);
  const visemeValue = useRef(0);
  const blinkValue = useRef(0);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.2) * 0.08;
      groupRef.current.position.y = Math.sin(t * 0.6) * 0.02;
    }

    const targetMouth = Math.min(amplitude * 1.4, 1);
    const targetViseme = viseme ? Math.min(viseme.value, 1) : 0;
    mouthValue.current = THREE.MathUtils.lerp(mouthValue.current, targetMouth, 0.18);
    visemeValue.current = THREE.MathUtils.lerp(visemeValue.current, targetViseme, 0.22);
    blinkValue.current = THREE.MathUtils.lerp(blinkValue.current, blink, 0.45);

    morphMeshes.forEach((mesh) => {
      MOUTH_TARGETS.forEach((name) => {
        setMorphValue(mesh, name, mouthValue.current);
      });

      if (viseme?.name) {
        setMorphValue(mesh, viseme.name, visemeValue.current);
      } else {
        VISemeFallback.forEach((name) => {
          setMorphValue(mesh, name, visemeValue.current * 0.35);
        });
      }

      setMorphValue(mesh, "eyeBlinkLeft", blinkValue.current);
      setMorphValue(mesh, "eyeBlinkRight", blinkValue.current);
    });
  });

  return <primitive ref={groupRef} object={scene} position={[0, -1.9, 0]} />;
};

const preloadUrl =
  process.env.NEXT_PUBLIC_AVATAR_MODEL || "/avatars/avaturn.glb";
useGLTF.preload(preloadUrl);
