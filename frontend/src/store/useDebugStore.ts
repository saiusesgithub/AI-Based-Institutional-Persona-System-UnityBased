import { create } from "zustand";

/**
 * Calibration overlay state. The adjustments are applied live on top of auto-framing so
 * the user can visually dial in size/placement/camera, then read the final numbers off
 * the panel and have them baked into code.
 */

export type DebugAdjust = {
  modelScale: number; // multiplier on the auto-framed scale
  modelX: number;
  modelY: number;
  rotYDeg: number;
  camY: number;
  camDist: number;
  fov: number;
};

export const DEFAULT_ADJUST: DebugAdjust = {
  modelScale: 1,
  modelX: 0,
  modelY: 0,
  rotYDeg: 0,
  camY: 1.15,
  camDist: 2.3,
  fov: 26,
};

type ModelStats = {
  personaId: string | null;
  modelUrl: string;
  nativeHeight: number;
  baseScale: number;
  basePosition: [number, number, number];
};

/** Live view state, sampled from the running scene a few times a second. */
export type LiveView = {
  cameraPosition: [number, number, number];
  target: [number, number, number] | null;
  distance: number | null;
  azimuthDeg: number | null;
  polarDeg: number | null;
  fov: number;
};

type DebugState = {
  enabled: boolean;
  adjust: DebugAdjust;
  stats: ModelStats | null;
  live: LiveView | null;
  toggle: () => void;
  setAdjust: (partial: Partial<DebugAdjust>) => void;
  reset: () => void;
  setStats: (stats: ModelStats) => void;
  setLive: (live: LiveView) => void;
};

export const useDebugStore = create<DebugState>((set) => ({
  enabled: false,
  adjust: { ...DEFAULT_ADJUST },
  stats: null,
  live: null,
  toggle: () => set((state) => ({ enabled: !state.enabled })),
  setAdjust: (partial) => set((state) => ({ adjust: { ...state.adjust, ...partial } })),
  reset: () => set({ adjust: { ...DEFAULT_ADJUST } }),
  setStats: (stats) => set({ stats }),
  setLive: (live) => set({ live }),
}));
