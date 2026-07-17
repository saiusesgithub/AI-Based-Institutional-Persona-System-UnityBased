"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { AvatarModel } from "@/components/AvatarModel";
import { useAppStore, selectActivePersona } from "@/store/useAppStore";
import { useDebugStore } from "@/store/useDebugStore";

const FALLBACK_MODEL = process.env.NEXT_PUBLIC_AVATAR_MODEL || "/avatars/hod.glb";

/**
 * Samples the live camera/view a few times a second into the debug store while the panel
 * is open. The user frames the shot by hand; the panel shows the numbers to bake in.
 */
const DebugTelemetry = () => {
  const enabled = useDebugStore((state) => state.enabled);
  const lastPushAt = useRef(0);
  const spherical = useRef(new THREE.Spherical());
  const offset = useRef(new THREE.Vector3());

  useFrame(({ camera, controls, clock }) => {
    if (!enabled) {
      return;
    }
    const now = clock.getElapsedTime();
    if (now - lastPushAt.current < 0.15) {
      return;
    }
    lastPushAt.current = now;

    const target = (controls as { target?: THREE.Vector3 } | null)?.target ?? null;
    const round = (value: number) => Number(value.toFixed(3));

    let distance: number | null = null;
    let azimuthDeg: number | null = null;
    let polarDeg: number | null = null;
    if (target) {
      offset.current.copy(camera.position).sub(target);
      spherical.current.setFromVector3(offset.current);
      distance = round(spherical.current.radius);
      azimuthDeg = round(THREE.MathUtils.radToDeg(spherical.current.theta));
      polarDeg = round(THREE.MathUtils.radToDeg(spherical.current.phi));
    }

    useDebugStore.getState().setLive({
      cameraPosition: [round(camera.position.x), round(camera.position.y), round(camera.position.z)],
      target: target ? [round(target.x), round(target.y), round(target.z)] : null,
      distance,
      azimuthDeg,
      polarDeg,
      fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 0,
    });
  });

  return null;
};

export const AvatarCanvas = () => {
  const persona = useAppStore(selectActivePersona);
  const modelUrl = persona?.model_url || FALLBACK_MODEL;

  return (
    <Canvas
      // User-calibrated default view (telemetry panel, 2026-07-17). Auto-framing normalizes
      // every model to the same size/floor, so this one view fits the whole roster.
      camera={{ position: [-0.886, 1.42, 1.444], fov: 26, near: 0.1, far: 15 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#0c0d0f"]} />
      <fog attach="fog" args={["#0c0d0f", 1.8, 6]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[1.6, 2.8, 1.8]} intensity={1.0} />
      <directionalLight position={[-1.4, 2.2, 0.6]} intensity={0.5} />
      <spotLight position={[0, 3.2, 2]} angle={0.35} penumbra={0.4} intensity={1.2} />
      <Suspense fallback={null}>
        {/* Keyed so switching persona mounts a fresh model instead of mutating the old one. */}
        <AvatarModel key={modelUrl} modelUrl={modelUrl} />
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan
        screenSpacePanning
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={4.5}
        minPolarAngle={0.3}
        maxPolarAngle={1.45}
        target={[0.045, 1.213, 0.015]}
      />
      <DebugTelemetry />
    </Canvas>
  );
};
