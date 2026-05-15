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
  const leftArmRef = useRef<THREE.Object3D | null>(null);
  const rightArmRef = useRef<THREE.Object3D | null>(null);
  const leftForearmRef = useRef<THREE.Object3D | null>(null);
  const rightForearmRef = useRef<THREE.Object3D | null>(null);
  const headRef = useRef<THREE.Object3D | null>(null);
  const spineRef = useRef<THREE.Object3D | null>(null);
  const baseRotations = useRef(new Map<string, THREE.Euler>());
  const dragState = useRef({ active: false, lastX: 0, lastY: 0 });

  useEffect(() => {
    if (animations.length > 0) {
      const first = animations[0].name;
      actions[first]?.reset().fadeIn(0.4).play();
      return;
    }
    baseRotations.current.clear();
    leftArmRef.current = null;
    rightArmRef.current = null;
    leftForearmRef.current = null;
    rightForearmRef.current = null;
    headRef.current = null;
    spineRef.current = null;

    scene.traverse((child) => {
      if (child.type !== "Bone") {
        return;
      }
      baseRotations.current.set(child.name, child.rotation.clone());
      const name = child.name.toLowerCase();
      if (name.includes("leftarm") || name.includes("leftupperarm") || name.includes("l_upperarm")) {
        leftArmRef.current = child;
      }
      if (name.includes("rightarm") || name.includes("rightupperarm") || name.includes("r_upperarm")) {
        rightArmRef.current = child;
      }
      if (name.includes("leftforearm") || name.includes("leftlowerarm") || name.includes("l_lowerarm")) {
        leftForearmRef.current = child;
      }
      if (name.includes("rightforearm") || name.includes("rightlowerarm") || name.includes("r_lowerarm")) {
        rightForearmRef.current = child;
      }
      if (name === "head" || name.includes("head")) {
        headRef.current = child;
      }
      if (name === "spine" || name === "spine2" || name.includes("neck")) {
        spineRef.current = child;
      }
    });

    const la: any = leftArmRef.current;
    const ra: any = rightArmRef.current;
    if (la && ra) {
      // Put arms down (Attention position) instead of T-pose
      // The drag logic indicates 'x' is the lift axis (up/down) and 'z' is spread
      // Lowering arms means reducing x rotation to about -70 degrees.
      la.rotation.x -= THREE.MathUtils.degToRad(70);
      ra.rotation.x -= THREE.MathUtils.degToRad(70);
      
      // Add a slight natural bend to the forearms so they don't look completely stiff
      const lf: any = leftForearmRef.current;
      if (lf) {
         lf.rotation.x -= THREE.MathUtils.degToRad(10);
      }
      const rf: any = rightForearmRef.current;
      if (rf) {
         rf.rotation.x -= THREE.MathUtils.degToRad(10);
      }
      
      // Update base rotations to be the new 'arms down' position
      baseRotations.current.set(la.name, la.rotation.clone());
      baseRotations.current.set(ra.name, ra.rotation.clone());
      if (lf) {
        baseRotations.current.set(lf.name, lf.rotation.clone());
      }
      if (rf) {
        baseRotations.current.set(rf.name, rf.rotation.clone());
      }
    }
  }, [actions, animations, scene]);

  const resetArms = () => {
    const resetBone = (bone: THREE.Object3D | null) => {
      if (!bone) {
        return;
      }
      const base = baseRotations.current.get(bone.name);
      if (base) {
        bone.rotation.copy(base);
      }
    };

    resetBone(leftArmRef.current);
    resetBone(rightArmRef.current);
    resetBone(leftForearmRef.current);
    resetBone(rightForearmRef.current);
    resetBone(headRef.current);
    resetBone(spineRef.current);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyR") {
        return;
      }
      resetArms();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const applyDrag = (dx: number, dy: number) => {
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    if (!leftArm || !rightArm || animations.length > 0) {
      return;
    }

    const lift = -dy * 0.004;
    const spread = dx * 0.003;

    leftArm.rotation.x = clamp(leftArm.rotation.x + lift, THREE.MathUtils.degToRad(-75), THREE.MathUtils.degToRad(15));
    rightArm.rotation.x = clamp(rightArm.rotation.x + lift, THREE.MathUtils.degToRad(-75), THREE.MathUtils.degToRad(15));

    leftArm.rotation.z = clamp(leftArm.rotation.z + spread, THREE.MathUtils.degToRad(-20), THREE.MathUtils.degToRad(20));
    rightArm.rotation.z = clamp(rightArm.rotation.z - spread, THREE.MathUtils.degToRad(-20), THREE.MathUtils.degToRad(20));

    if (leftForearmRef.current) {
      leftForearmRef.current.rotation.x = clamp(leftArm.rotation.x * 0.35, THREE.MathUtils.degToRad(-45), 0);
    }
    if (rightForearmRef.current) {
      rightForearmRef.current.rotation.x = clamp(rightArm.rotation.x * 0.35, THREE.MathUtils.degToRad(-45), 0);
    }
  };

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
      // Base idle sway
      groupRef.current.rotation.y = Math.sin(t * 0.2) * 0.08;
      groupRef.current.position.y = Math.sin(t * 0.6) * 0.02;
    }

    // Procedural gestures based on audio amplitude
    if (headRef.current) {
      const baseHead = baseRotations.current.get(headRef.current.name);
      if (baseHead) {
        // Nod and tilt head slightly when speaking, and a tiny bit when idle
        const isSpeaking = amplitude > 0.05;
        const nod = Math.sin(t * (isSpeaking ? 5 : 2)) * (isSpeaking ? amplitude * 0.3 : 0.02);
        const tilt = Math.cos(t * (isSpeaking ? 3 : 1.5)) * (isSpeaking ? amplitude * 0.2 : 0.01);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, baseHead.x + nod, 0.1);
        headRef.current.rotation.z = THREE.MathUtils.lerp(headRef.current.rotation.z, baseHead.z + tilt, 0.1);
      }
    }

    if (spineRef.current) {
      const baseSpine = baseRotations.current.get(spineRef.current.name);
      if (baseSpine) {
        // Subtle spine breathing/sway
        const sway = Math.sin(t * 1.5) * 0.02;
        spineRef.current.rotation.z = THREE.MathUtils.lerp(spineRef.current.rotation.z, baseSpine.z + sway, 0.1);
      }
    }

    // Arm gestures when speaking
    if (rightArmRef.current && rightForearmRef.current && !dragState.current.active) {
      const baseRA = baseRotations.current.get(rightArmRef.current.name);
      const baseRFA = baseRotations.current.get(rightForearmRef.current.name);
      if (baseRA && baseRFA) {
         // Smoothly raise arm into a gesture if speaking, otherwise return to base
         const isSpeaking = amplitude > 0.05;
         // Generate a slow, organic wave for the gesture height
         const gestureWave = Math.sin(t * 2) * 0.4;
         // The target rotation is higher up when speaking
         const targetRAx = isSpeaking ? baseRA.x + 0.6 + gestureWave : baseRA.x;
         const targetRFAx = isSpeaking ? baseRFA.x - 0.8 + gestureWave * 0.5 : baseRFA.x;
         
         rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRAx, 0.05);
         rightForearmRef.current.rotation.x = THREE.MathUtils.lerp(rightForearmRef.current.rotation.x, targetRFAx, 0.05);
      }
    }

    // Reduce amplitude and cap max values to simulate a small, murmuring lip movement
    const targetMouth = Math.min(amplitude * 0.5, 0.25);
    const targetViseme = viseme ? Math.min(viseme.value * 0.4, 0.3) : 0;
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

  return (
    <primitive
      ref={groupRef}
      object={scene}
      position={[0, -1.9, 0]}
      onPointerDown={(event: any) => {
        dragState.current = { active: true, lastX: event.clientX, lastY: event.clientY };
      }}
      onPointerUp={() => {
        dragState.current.active = false;
      }}
      onPointerLeave={() => {
        dragState.current.active = false;
      }}
      onPointerMove={(event: any) => {
        if (!dragState.current.active) {
          return;
        }
        const dx = event.clientX - dragState.current.lastX;
        const dy = event.clientY - dragState.current.lastY;
        dragState.current.lastX = event.clientX;
        dragState.current.lastY = event.clientY;
        applyDrag(dx, dy);
      }}
    />
  );
};

const preloadUrl =
  process.env.NEXT_PUBLIC_AVATAR_MODEL || "/avatars/avaturn.glb";
useGLTF.preload(preloadUrl);
