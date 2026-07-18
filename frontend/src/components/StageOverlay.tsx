"use client";

import { useAppStore, selectActivePersona } from "@/store/useAppStore";

/** Name tag, video-call style: just who is on screen. No technical readouts. */
export const StageOverlay = () => {
  const persona = useAppStore(selectActivePersona);

  if (!persona) {
    return null;
  }

  return (
    <div className="name-tag" style={{ "--persona-accent": persona.accent_color } as React.CSSProperties}>
      <span className="name-tag-dot" aria-hidden="true" />
      <span>
        <span className="name-tag-name">{persona.display_name}</span>
        <span className="name-tag-role">{persona.role}</span>
      </span>
    </div>
  );
};
