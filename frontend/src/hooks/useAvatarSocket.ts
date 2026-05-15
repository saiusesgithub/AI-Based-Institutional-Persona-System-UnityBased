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
  state?: string;
};

export const useAvatarSocket = () => {
  const setConnectionStatus = useAppStore((state) => state.setConnectionStatus);
  const addTranscript = useAppStore((state) => state.addTranscript);
  const setViseme = useAppStore((state) => state.setViseme);
  const setMicState = useAppStore((state) => state.setMicState);
  const setMicError = useAppStore((state) => state.setMicError);

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
            console.info("[stt] transcript received", data.text.length);
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
          if (data.type === "stt_status" && data.message) {
            console.info("[stt] status", data.message);
          }
          if (data.type === "stt_status" && data.state) {
            if (data.state === "recording") {
              setMicState("recording");
            } else if (data.state === "processing") {
              setMicState("processing");
            } else if (data.state === "empty") {
              setMicState("listening");
            } else if (data.state === "complete") {
              setMicState("processing");
            } else if (data.state === "error") {
              setMicState("error");
            }
          }
          if (data.type === "error" && data.message) {
            addTranscript({ role: "system", text: data.message });
            setMicError(data.message);
            setMicState("error");
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
  }, [addTranscript, setConnectionStatus, setMicError, setMicState, setViseme]);

  const sendMessage = (payload: Record<string, unknown>) => {
    return getSocketManager().sendJson(payload);
  };

  const sendBinary = (payload: Blob) => {
    const manager = getSocketManager();
    console.info("[ws] state", manager.getStatus());
    return manager.sendBinaryIfOpen(payload);
  };

  return { sendMessage, sendBinary, sendEvent: sendMessage };
};
