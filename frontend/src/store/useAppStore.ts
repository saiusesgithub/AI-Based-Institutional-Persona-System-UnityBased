import { create } from "zustand";

type ConnectionStatus = "connecting" | "open" | "closed" | "error";

type TranscriptEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
};

type VisemeSignal = {
  name: string;
  value: number;
} | null;

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
  viseme: VisemeSignal;
  micPermission: MicPermission;
  micState: MicState;
  micError: string | null;
  setConnectionStatus: (status: ConnectionStatus) => void;
  addTranscript: (entry: Omit<TranscriptEntry, "id" | "timestamp">) => void;
  setInput: (value: string) => void;
  setListening: (value: boolean) => void;
  toggleListening: () => void;
  toggleMuted: () => void;
  setViseme: (signal: VisemeSignal) => void;
  setMicPermission: (value: MicPermission) => void;
  setMicState: (value: MicState) => void;
  setMicError: (value: string | null) => void;
};

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useAppStore = create<AppState>((set) => ({
  connectionStatus: "connecting",
  transcript: [],
  input: "",
  listening: false,
  muted: false,
  viseme: null,
  micPermission: "prompt",
  micState: "idle",
  micError: null,
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
  setViseme: (signal) => set({ viseme: signal }),
  setMicPermission: (value) => set({ micPermission: value }),
  setMicState: (value) => set({ micState: value }),
  setMicError: (value) => set({ micError: value }),
}));
