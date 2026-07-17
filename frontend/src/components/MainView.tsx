"use client";

import { Stage } from "@/components/Stage";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ControlsBar } from "@/components/ControlsBar";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { DebugPanel } from "@/components/DebugPanel";
import { useCallback, useEffect } from "react";
import { useAvatarSocket } from "@/hooks/useAvatarSocket";
import { useMicrophoneStream } from "@/hooks/useMicrophoneStream";
import { usePersonas } from "@/hooks/usePersonas";
import { useAppStore } from "@/store/useAppStore";

export const MainView = () => {
  const { sendMessage, sendBinary, sendEvent } = useAvatarSocket();
  const addTranscript = useAppStore((state) => state.addTranscript);
  const activePersonaId = useAppStore((state) => state.activePersonaId);
  const language = useAppStore((state) => state.language);

  usePersonas();

  const { start, stop } = useMicrophoneStream({
    sendChunk: sendBinary,
    sendEvent,
    persona: activePersonaId ?? undefined,
    language,
    includeAudio: true,
  });

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA";
    };

    // Hold "A" to talk: press starts capture, release ends the turn.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== "KeyA" || isTypingTarget(event.target)) {
        return;
      }
      void start();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyA" || isTypingTarget(event.target)) {
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
    const ok = sendMessage({
      type: "chat",
      message,
      persona: activePersonaId,
      language,
      include_audio: true,
    });
    addTranscript({ role: "user", text: message });
    if (!ok) {
      addTranscript({ role: "system", text: "Socket offline. Message queued locally." });
    }
  };

  const handlePersonaSwitch = useCallback(
    (personaId: string) => {
      // The backend keeps its own per-connection persona and history; keep them in step.
      sendMessage({ type: "persona", persona: personaId });
    },
    [sendMessage],
  );

  return (
    <main className="app-shell">
      <Stage />
      <PersonaSwitcher onSwitch={handlePersonaSwitch} />
      <DebugPanel />
      <TranscriptPanel />
      <ControlsBar onSend={handleSend} onHoldStart={() => void start()} onHoldEnd={stop} />
    </main>
  );
};
