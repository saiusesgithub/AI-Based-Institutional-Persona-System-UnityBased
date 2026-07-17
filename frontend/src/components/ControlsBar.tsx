"use client";

import { useAppStore } from "@/store/useAppStore";
import { ConnectionStatus } from "@/components/ConnectionStatus";

type ControlsBarProps = {
  onSend: (message: string) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

export const ControlsBar = ({ onSend, onHoldStart, onHoldEnd }: ControlsBarProps) => {
  const input = useAppStore((state) => state.input);
  const listening = useAppStore((state) => state.listening);
  const muted = useAppStore((state) => state.muted);
  const micPermission = useAppStore((state) => state.micPermission);
  const micState = useAppStore((state) => state.micState);
  const micError = useAppStore((state) => state.micError);
  const setInput = useAppStore((state) => state.setInput);
  const toggleMuted = useAppStore((state) => state.toggleMuted);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);

  const micStatusLabel =
    micState === "recording"
      ? "Recording"
      : micState === "processing"
      ? "Processing"
      : micState === "requesting_permission"
      ? "Requesting mic"
      : micState === "listening"
      ? "Listening"
      : micState === "disconnected"
      ? "Disconnected"
      : micState === "error"
      ? "Mic error"
      : micPermission === "granted"
      ? "Mic ready"
      : "Mic blocked";

  const micStatusState =
    micState === "error" || micPermission === "denied" ? "error" : micPermission === "granted" ? "open" : "closed";

  const handleSend = () => {
    if (!input.trim()) {
      return;
    }
    onSend(input.trim());
    setInput("");
  };

  return (
    <section className="controls">
      <div className="control-group">
        <button
          type="button"
          className={`control-button push-to-talk ${listening ? "active" : ""}`}
          // Hold to speak: press starts recording, release sends the turn. pointerleave and
          // pointercancel also end it so a drag off the button can't leave the mic stuck open.
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onHoldStart();
          }}
          onPointerUp={onHoldEnd}
          onPointerCancel={onHoldEnd}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Hold to speak"
          title="Hold to speak (or hold A)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
            <path d="M19 11a7 7 0 0 1-14 0" />
            <path d="M12 18v3" />
          </svg>
          <span className="push-to-talk-label">{listening ? "Release to send" : "Hold to speak"}</span>
        </button>
        <button
          type="button"
          className={`control-button ${muted ? "active" : ""}`}
          onClick={toggleMuted}
          aria-label="Toggle mute"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9 9v6" />
            <path d="M9 9c0-1.66 1.34-3 3-3" />
            <path d="M12 6c1.66 0 3 1.34 3 3v6" />
            <path d="M5 5l14 14" />
          </svg>
        </button>
      </div>

      <div className="input-shell">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSend();
            }
          }}
          placeholder="Type a message..."
        />
        <button className="send-button" onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>

      <div className="control-group">
        <select
          className="language-select"
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label="Conversation language"
        >
          <option value="auto">Auto language</option>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="te">తెలుగు</option>
        </select>
        <ConnectionStatus />
        <div className="status-dot" data-state={micStatusState} title={micError ?? undefined}>
          <span />
          {micStatusLabel}
        </div>
      </div>
    </section>
  );
};
