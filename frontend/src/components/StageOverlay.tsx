"use client";

import { useAppStore, selectActivePersona } from "@/store/useAppStore";

export const StageOverlay = () => {
  const persona = useAppStore(selectActivePersona);
  const emotion = useAppStore((state) => state.emotion);

  return (
    <div className="stage-overlay">
      <div>
        <div className="stage-overlay-name">{persona?.display_name ?? "Institutional persona"}</div>
        <div className="stage-overlay-role">
          {persona?.tagline || persona?.role || "Realtime session"}
        </div>
      </div>
      <div className="stage-overlay-emotion">{emotion}</div>
    </div>
  );
};
