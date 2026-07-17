"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useDebugStore } from "@/store/useDebugStore";

/**
 * Live view telemetry. Press D to toggle. Frame the avatar by hand (drag to orbit, wheel
 * to zoom, right-drag to pan) — the numbers update in real time. Screenshot the JSON (or
 * Copy JSON) and those exact values get baked in as the default view for every avatar:
 * auto-framing normalizes all models to the same size and floor position first, so one
 * camera setup fits the whole roster.
 */
export const DebugPanel = () => {
  const enabled = useDebugStore((state) => state.enabled);
  const stats = useDebugStore((state) => state.stats);
  const live = useDebugStore((state) => state.live);
  const toggle = useDebugStore((state) => state.toggle);
  const activePersonaId = useAppStore((state) => state.activePersonaId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyD" || event.repeat) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  if (!enabled) {
    return null;
  }

  const dump = {
    persona: activePersonaId,
    view: live,
    model: stats
      ? {
          url: stats.modelUrl,
          nativeHeight: Number(stats.nativeHeight.toFixed(3)),
          appliedScale: Number(stats.baseScale.toFixed(4)),
          position: stats.basePosition.map((value) => Number(value.toFixed(3))),
        }
      : null,
  };

  return (
    <aside className="debug-panel">
      <div className="debug-panel-head">
        <strong>Live view telemetry</strong>
        <span>[D] to close</span>
      </div>
      <p className="debug-hint">
        Frame the avatar with the mouse (drag = orbit, wheel = zoom, right-drag = pan).
        Numbers update live — screenshot this and send it.
      </p>
      <div className="debug-actions">
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(JSON.stringify(dump, null, 2))}
        >
          Copy JSON
        </button>
      </div>
      <pre className="debug-json">{JSON.stringify(dump, null, 2)}</pre>
    </aside>
  );
};
