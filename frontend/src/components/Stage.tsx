"use client";

import { AvatarCanvas } from "@/components/AvatarCanvas";
import { StageOverlay } from "@/components/StageOverlay";

export const Stage = () => {
  return (
    <section className="stage">
      <div className="stage-inner">
        <AvatarCanvas />
      </div>
      <StageOverlay />
    </section>
  );
};
