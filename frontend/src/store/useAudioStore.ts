import { create } from "zustand";

type AudioState = {
  amplitude: number;
  speaking: boolean;
  setAmplitude: (value: number) => void;
  setSpeaking: (value: boolean) => void;
};

export const useAudioStore = create<AudioState>((set) => ({
  amplitude: 0,
  speaking: false,
  setAmplitude: (value) => set({ amplitude: value }),
  setSpeaking: (value) => set({ speaking: value }),
}));
