"use client";

import { Stage } from "@/components/Stage";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ControlsBar } from "@/components/ControlsBar";
import { useAvatarSocket } from "@/hooks/useAvatarSocket";
import { useMicrophoneStream } from "@/hooks/useMicrophoneStream";
import { useAppStore } from "@/store/useAppStore";

export const MainView = () => {
  const { sendMessage, sendBinary, sendEvent } = useAvatarSocket();
  const addTranscript = useAppStore((state) => state.addTranscript);
  const persona = "hod";
  const { toggle } = useMicrophoneStream({
    sendChunk: sendBinary,
    sendEvent,
    persona,
    language: "auto",
    includeAudio: true,
  });

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
