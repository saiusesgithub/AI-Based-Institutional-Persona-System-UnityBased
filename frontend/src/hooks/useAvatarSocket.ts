"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { playAudioBase64 } from "@/lib/audioEngine";
import { getSocketManager } from "@/lib/socketManager";

type SocketMessage = {
  type?: string;
  text?: string;
  role?: "user" | "assistant" | "system";
  audioBase64?: string;
  viseme?: { name: string; value: number };
  message?: string;
};

export const useAvatarSocket = () => {
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus);
  const addTranscript = useAppStore((state) => state.addTranscript);
  const setViseme = useAppStore((state) => state.setViseme);

  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

    const manager = getSocketManager();
    const release = manager.acquire(url);

    const unsubscribeStatus = manager.onStatus((status) => {
      setConnectionStatus(status);
    });

    const unsubscribeMessage = manager.onMessage((raw) => {
      if (typeof raw === "string") {
        try {
          const data = JSON.parse(raw) as SocketMessage;
          if (data.type === "transcript" && data.text) {
            addTranscript({
              role: data.role ?? "assistant",
              text: data.text,
            });
          }
          if (data.type === "audio" && data.audioBase64) {
            void playAudioBase64(data.audioBase64);
          }
          if (data.type === "viseme" && data.viseme) {
            setViseme(data.viseme);
          }
          if (data.type === "error" && data.message) {
            addTranscript({ role: "system", text: data.message });
          }
        } catch (error) {
          addTranscript({ role: "assistant", text: raw });
        }
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      release();
    };
  }, [addTranscript, setConnectionStatus, setViseme]);

  const sendMessage = (payload: Record<string, unknown>) => {
    return getSocketManager().sendJson(payload);
  };

  const sendBinary = (payload: Blob) => getSocketManager().sendBinary(payload);

  return { sendMessage, sendBinary, sendEvent: sendMessage };
};
