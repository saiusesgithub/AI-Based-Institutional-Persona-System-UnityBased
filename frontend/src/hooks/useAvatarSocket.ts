"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { playAudioBase64 } from "@/lib/audioEngine";
import { getSocketManager } from "@/lib/socketManager";
import type { VisemeCue } from "@/lib/lipsync";

type SocketMessage = {
  type?: string;
  text?: string;
  role?: "user" | "assistant" | "system";
  audioBase64?: string;
  visemes?: VisemeCue[];
  emotion?: string;
  gesture?: string;
  message?: string;
  state?: string;
};

export const useAvatarSocket = () => {
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus);
  const addTranscript = useAppStore((state) => state.addTranscript);
  const setMicState = useAppStore((state) => state.setMicState);
  const setMicError = useAppStore((state) => state.setMicError);
  const setAvatarHints = useAppStore((state) => state.setAvatarHints);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
    const manager = getSocketManager();
    const release = manager.acquire(url);

    const unsubscribeStatus = manager.onStatus(setConnectionStatus);

    const unsubscribeMessage = manager.onMessage((raw) => {
      if (typeof raw !== "string") {
        return;
      }

      let data: SocketMessage;
      try {
        data = JSON.parse(raw) as SocketMessage;
      } catch {
        return;
      }

      switch (data.type) {
        case "transcript":
          if (data.text) {
            addTranscript({ role: data.role ?? "assistant", text: data.text });
          }
          break;

        case "audio":
          if (data.audioBase64) {
            // Visemes are timed against this clip, so they travel with it.
            void playAudioBase64(data.audioBase64, data.visemes ?? []);
          }
          break;

        case "metadata":
          setAvatarHints(data.emotion, data.gesture);
          break;

        case "stt_status":
          if (data.state === "recording") {
            setMicState("recording");
          } else if (data.state === "processing" || data.state === "complete") {
            setMicState("processing");
          } else if (data.state === "empty") {
            setMicState("listening");
          } else if (data.state === "error") {
            setMicState("error");
          }
          break;

        case "error":
          if (data.message) {
            addTranscript({ role: "system", text: data.message });
            setMicError(data.message);
            setMicState("error");
          }
          break;

        default:
          break;
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      release();
    };
  }, [addTranscript, setAvatarHints, setConnectionStatus, setMicError, setMicState]);

  const sendMessage = (payload: Record<string, unknown>) => getSocketManager().sendJson(payload);
  const sendBinary = (payload: Blob) => getSocketManager().sendBinaryIfOpen(payload);

  return { sendMessage, sendBinary, sendEvent: sendMessage };
};
