"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { AvatarModel } from "@/components/AvatarModel";

export const AvatarCanvas = () => {
  return (
    <Canvas
      camera={{ position: [0, 1.6, 2.15], fov: 26, near: 0.1, far: 15 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#0c0d0f"]} />
      <fog attach="fog" args={["#0c0d0f", 1.8, 6]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[1.6, 2.8, 1.8]} intensity={1.0} />
      <directionalLight position={[-1.4, 2.2, 0.6]} intensity={0.5} />
      <spotLight position={[0, 3.2, 2]} angle={0.35} penumbra={0.4} intensity={1.2} />
      <Suspense fallback={null}>
        <AvatarModel />
        <Environment preset="studio" environmentIntensity={0.5} />
      </Suspense>
      <OrbitControls
        enablePan
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={1.2}
        maxDistance={4.5}
        minPolarAngle={0.3}
        maxPolarAngle={1.45}
        target={[0, 1.45, 0]}
      />
    </Canvas>
  );
};
