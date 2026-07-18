import { create } from "zustand";

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
};

export type Persona = {
  id: string;
  display_name: string;
  role: string;
  model_url: string;
  accent_color: string;
  tagline: string;
  default_emotion: string;
  default_gesture: string;
};

type MicPermission = "prompt" | "granted" | "denied" | "error";

type MicState =
  | "idle"
  | "requesting_permission"
  | "listening"
  | "recording"
  | "processing"
  | "disconnected"
  | "error";

type AppState = {
  connectionStatus: ConnectionStatus;
  transcript: TranscriptEntry[];
  input: string;
  listening: boolean;
  muted: boolean;
  micPermission: MicPermission;
  micState: MicState;
  micError: string | null;
  personas: Persona[];
  activePersonaId: string | null;
  emotion: string;
  gesture: string;
  language: string;
  setConnectionStatus: (status: ConnectionStatus) => void;
  addTranscript: (entry: Omit<TranscriptEntry, "id" | "timestamp">) => void;
  setInput: (value: string) => void;
  setListening: (value: boolean) => void;
  toggleListening: () => void;
  toggleMuted: () => void;
  setMicPermission: (value: MicPermission) => void;
  setMicState: (value: MicState) => void;
  setMicError: (value: string | null) => void;
  setPersonas: (personas: Persona[], defaultId: string) => void;
  setActivePersona: (id: string) => void;
  setAvatarHints: (emotion?: string, gesture?: string) => void;
  setLanguage: (language: string) => void;
};

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useAppStore = create<AppState>((set) => ({
  connectionStatus: "connecting",
  transcript: [],
  input: "",
  listening: false,
  muted: false,
  micPermission: "prompt",
  micState: "idle",
  micError: null,
  personas: [],
  activePersonaId: null,
  emotion: "neutral",
  gesture: "idle",
  language: "en",
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  addTranscript: (entry) =>
    set((state) => {
      const next = [
        ...state.transcript,
        {
          id: makeId(),
          timestamp: Date.now(),
          ...entry,
        },
      ].slice(-8);
      return { transcript: next };
    }),
  setInput: (value) => set({ input: value }),
  setListening: (value) => set({ listening: value }),
  toggleListening: () => set((state) => ({ listening: !state.listening })),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),
  setMicPermission: (value) => set({ micPermission: value }),
  setMicState: (value) => set({ micState: value }),
  setMicError: (value) => set({ micError: value }),
  setPersonas: (personas, defaultId) =>
    set((state) => ({
      personas,
      activePersonaId: state.activePersonaId ?? defaultId,
    })),
  setActivePersona: (id) =>
    set((state) => {
      if (state.activePersonaId === id) {
        return state;
      }
      const persona = state.personas.find((item) => item.id === id);
      // A persona switch starts a fresh conversation, mirroring the backend.
      return {
        activePersonaId: id,
        transcript: [],
        emotion: persona?.default_emotion ?? "neutral",
        gesture: persona?.default_gesture ?? "idle",
      };
    }),
  setAvatarHints: (emotion, gesture) =>
    set((state) => ({
      emotion: emotion ?? state.emotion,
      gesture: gesture ?? state.gesture,
    })),
  setLanguage: (language) => set({ language }),
}));

export const selectActivePersona = (state: AppState) =>
  state.personas.find((persona) => persona.id === state.activePersonaId) ?? null;
