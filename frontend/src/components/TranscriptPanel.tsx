"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useEffect, useRef } from "react";

export const TranscriptPanel = () => {
  const transcript = useAppStore((state) => state.transcript);
  const micError = useAppStore((state) => state.micError);
  const micState = useAppStore((state) => state.micState);

  const liveLine =
    micState === "recording" || micState === "listening"
      ? "Listening..."
      : micState === "processing"
      ? "Processing..."
      : null;

  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [transcript, liveLine, micError]);

  return (
    <section className="transcript">
      <h2>Live transcript</h2>
      <div className="transcript-stream" ref={streamRef}>
        <AnimatePresence initial={false}>
          {transcript.map((line) => (
            <motion.div
              key={line.id}
              className="transcript-line"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <strong>{line.role === "user" ? "You" : "Persona"}:</strong> {line.text}
            </motion.div>
          ))}
        </AnimatePresence>
        {transcript.length === 0 ? (
          <div className="transcript-line">
            <strong>System:</strong> Waiting for the first message...
          </div>
        ) : null}
        {micError ? (
          <div className="transcript-line">
            <strong>System:</strong> {micError}
          </div>
        ) : null}
        {liveLine ? (
          <div className="transcript-line">
            <strong>System:</strong> {liveLine}
          </div>
        ) : null}
      </div>
    </section>
  );
};
