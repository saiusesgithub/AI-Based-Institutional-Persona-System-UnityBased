"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";

type ControlsBarProps = {
  onSend: (message: string) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
};

const LANGUAGES = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "EN" },
  { value: "hi", label: "हि" },
  { value: "te", label: "తె" },
];

/**
 * Video-call control bar: one big hold-to-talk button front and center, a keyboard
 * toggle for typed questions, and a language pill. Everything sized for fingers.
 */
export const ControlsBar = ({ onSend, onHoldStart, onHoldEnd }: ControlsBarProps) => {
  const input = useAppStore((state) => state.input);
  const listening = useAppStore((state) => state.listening);
  const micState = useAppStore((state) => state.micState);
  const micPermission = useAppStore((state) => state.micPermission);
  const setInput = useAppStore((state) => state.setInput);
  const language = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const micBlocked = micPermission === "denied" || micPermission === "error";

  const handleSend = () => {
    const message = input.trim();
    if (!message) {
      return;
    }
    onSend(message);
    setInput("");
  };

  return (
    <>
      {keyboardOpen ? (
        <div className="type-drawer">
          <input
            autoFocus
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSend();
              }
            }}
            placeholder="Type your question..."
          />
          <button type="button" className="type-send" onClick={handleSend} disabled={!input.trim()}>
            Send
          </button>
        </div>
      ) : null}

      <div className="call-bar">
        <div className="lang-pills" role="radiogroup" aria-label="Language">
          {LANGUAGES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={language === value}
              className={`lang-pill${language === value ? " is-active" : ""}`}
              onClick={() => setLanguage(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`talk-button${listening ? " is-recording" : ""}${micBlocked ? " is-blocked" : ""}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onHoldStart();
          }}
          onPointerUp={onHoldEnd}
          onPointerCancel={onHoldEnd}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Hold to speak"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z" />
            <path d="M19 11a7 7 0 0 1-14 0" />
            <path d="M12 18v3" />
          </svg>
          <span className="talk-button-label">
            {micBlocked ? "Mic unavailable" : listening ? "Release to send" : micState === "processing" ? "Thinking..." : "Hold to talk"}
          </span>
        </button>

        <button
          type="button"
          className={`round-button${keyboardOpen ? " is-active" : ""}`}
          onClick={() => setKeyboardOpen((open) => !open)}
          aria-label="Type instead"
          aria-pressed={keyboardOpen}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="3" y="7" width="18" height="11" rx="2" />
            <path d="M7 11h.01M11 11h.01M15 11h.01M7 14.5h.01M17 14.5h.01M10 14.5h4" />
          </svg>
        </button>
      </div>
    </>
  );
};
