"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

/**
 * Video-call style live captions: the last couple of lines float over the video, and
 * listening/thinking states show as a subtle pill. No log, no headings, no jargon.
 */
export const TranscriptPanel = () => {
  const transcript = useAppStore((state) => state.transcript);
  const micState = useAppStore((state) => state.micState);

  const statusPill =
    micState === "recording"
      ? "Listening..."
      : micState === "processing"
      ? "Thinking..."
      : null;

  const lines = transcript.filter((line) => line.role !== "system").slice(-2);
  const lastError = transcript.filter((line) => line.role === "system").slice(-1)[0];
  const showError = Boolean(lastError) && micState === "error";

  return (
    <div className="captions" aria-live="polite">
      <AnimatePresence initial={false}>
        {lines.map((line) => (
          <motion.p
            key={line.id}
            className={`caption ${line.role === "user" ? "caption-user" : "caption-persona"}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {line.text}
          </motion.p>
        ))}
      </AnimatePresence>
      {showError ? <p className="caption caption-error">{lastError.text}</p> : null}
      {statusPill ? (
        <div className="caption-status">
          <span className="caption-status-pulse" aria-hidden="true" />
          {statusPill}
        </div>
      ) : null}
    </div>
  );
};
