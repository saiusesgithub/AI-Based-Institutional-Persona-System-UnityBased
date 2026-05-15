"use client";

import { Stage } from "@/components/Stage";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ControlsBar } from "@/components/ControlsBar";
import { useEffect } from "react";
import { useAvatarSocket } from "@/hooks/useAvatarSocket";
import { useMicrophoneStream } from "@/hooks/useMicrophoneStream";
import { useAppStore } from "@/store/useAppStore";

export const MainView = () => {
  const { sendMessage, sendBinary, sendEvent } = useAvatarSocket();
  const addTranscript = useAppStore((state) => state.addTranscript);
  const persona = "hod";
  const { start, stop, toggle } = useMicrophoneStream({
    sendChunk: sendBinary,
    sendEvent,
    persona,
    language: "auto",
    includeAudio: true,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.code !== "KeyA") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      void start();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyA") {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      stop();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [start, stop]);

  const handleSend = (message: string) => {
    const ok = sendMessage({ type: "chat", message, persona, include_audio: true });
    addTranscript({ role: "user", text: message });
    if (!ok) {
      addTranscript({
        role: "system",
        text: "Socket offline. Message queued locally.",
      });
    }
  };

  return (
    <main className="app-shell">
      <Stage />
      <TranscriptPanel />
      <ControlsBar onSend={handleSend} onToggleListening={toggle} />
    </main>
  );
};
