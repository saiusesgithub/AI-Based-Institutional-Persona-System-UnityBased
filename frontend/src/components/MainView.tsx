 "use client";

import { Stage } from "@/components/Stage";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ControlsBar } from "@/components/ControlsBar";
import { PersonaSwitcher } from "@/components/PersonaSwitcher";
import { ConnectionStatus } from "@/components/ConnectionStatus";
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

    // Hold "A" to talk — keyboard twin of the on-screen hold button.
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
      addTranscript({ role: "system", text: "Connection lost — reconnecting..." });
    }
  };

  const handlePersonaSwitch = useCallback(
    (personaId: string) => {
      sendMessage({ type: "persona", persona: personaId });
    },
    [sendMessage],
  );

  return (
    <main className="call-shell">
      <Stage />
      <ConnectionStatus />
      <PersonaSwitcher onSwitch={handlePersonaSwitch} />
      <TranscriptPanel />
      <ControlsBar onSend={handleSend} onHoldStart={() => void start()} onHoldEnd={stop} />
      <DebugPanel />
    </main>
  );
};
