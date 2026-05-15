"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

export const TranscriptPanel = () => {
  const transcript = useAppStore((state) => state.transcript);
  const micError = useAppStore((state) => state.micError);

  return (
    <section className="transcript">
      <h2>Live transcript</h2>
      <div className="transcript-stream">
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
      </div>
    </section>
  );
};
