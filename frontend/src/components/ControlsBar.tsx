"use client";

import { useAppStore } from "@/store/useAppStore";
import { ConnectionStatus } from "@/components/ConnectionStatus";

type ControlsBarProps = {
  onSend: (message: string) => void;
  onToggleListening: () => void;
};

export const ControlsBar = ({ onSend, onToggleListening }: ControlsBarProps) => {
  const input = useAppStore((state) => state.input);
  const listening = useAppStore((state) => state.listening);
  const muted = useAppStore((state) => state.muted);
  const micPermission = useAppStore((state) => state.micPermission);
  const setInput = useAppStore((state) => state.setInput);
  const toggleMuted = useAppStore((state) => state.toggleMuted);

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
          className={`control-button ${listening ? "active" : ""}`}
          onClick={onToggleListening}
          aria-label="Toggle microphone"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
            <path d="M19 11a7 7 0 0 1-14 0" />
            <path d="M12 18v3" />
          </svg>
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
        <ConnectionStatus />
        <div className="status-dot" data-state={micPermission === "granted" ? "open" : "closed"}>
          <span />
          Mic {micPermission === "granted" ? "ready" : "blocked"}
        </div>
      </div>
    </section>
  );
};
