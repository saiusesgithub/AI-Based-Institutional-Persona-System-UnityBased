"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { stopAudio } from "@/lib/audioEngine";

const pickMimeType = () => {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/wav",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
};

type UseMicrophoneStreamOptions = {
  sendChunk: (blob: Blob) => boolean;
  sendEvent: (payload: Record<string, unknown>) => void;
  persona?: string;
  language?: string;
  includeAudio?: boolean;
};

/** How often audio is flushed to the server while the button is held. */
const CHUNK_MS = 500;

/**
 * Push-to-talk microphone capture.
 *
 * The turn boundary is the user releasing the button — there is no timer that decides when
 * you have stopped talking. Audio streams while held so that by release most of it is
 * already at the server, and the transcript comes back quickly.
 */
export const useMicrophoneStream = ({
  sendChunk,
  sendEvent,
  persona,
  language = "auto",
  includeAudio = true,
}: UseMicrophoneStreamOptions) => {
  const listening = useAppStore((state) => state.listening);
  const setListening = useAppStore((state) => state.setListening);
  const setMicPermission = useAppStore((state) => state.setMicPermission);
  const setMicState = useAppStore((state) => state.setMicState);
  const setMicError = useAppStore((state) => state.setMicError);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startInProgress = useRef(false);
  const sentAnyAudio = useRef(false);

  // Latched so the recorder callbacks always see current values without being re-created.
  const optionsRef = useRef({ persona, language, includeAudio, sendChunk, sendEvent });

  useEffect(() => {
    optionsRef.current = { persona, language, includeAudio, sendChunk, sendEvent };
  }, [persona, language, includeAudio, sendChunk, sendEvent]);

  const teardown = useCallback(() => {
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    // The commit is sent from onstop, not here: stop() only *schedules* the final
    // dataavailable, so committing now would race the last chunk and clip the sentence.
    recorder.stop();
    setListening(false);
  }, [setListening]);

  const start = useCallback(async () => {
    if (recorderRef.current || startInProgress.current) {
      return;
    }
    startInProgress.current = true;

    // Barge-in: holding to speak silences the avatar immediately. Talking over a visitor
    // is the one thing a kiosk must never do.
    stopAudio();

    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setMicPermission("denied");
        setMicError("Microphone requires HTTPS or localhost.");
        setMicState("error");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setMicPermission("error");
        setMicError("Browser does not support microphone recording.");
        setMicState("error");
        return;
      }

      setMicState("requesting_permission");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission("granted");
      setMicError(null);

      const mimeType = pickMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        setMicPermission("error");
        setMicError("MediaRecorder failed to initialize.");
        setMicState("error");
        teardown();
        return;
      }
      recorderRef.current = recorder;

      const contentType = (mimeType || "audio/webm").split(";")[0];
      const filename = contentType.includes("ogg") ? "audio.ogg" : "audio.webm";
      sentAnyAudio.current = false;

      const { sendEvent: emit, persona: p, language: lang, includeAudio: audio } = optionsRef.current;
      emit({
        type: "stt_start",
        content_type: contentType,
        filename,
        language: lang,
        persona: p,
        include_audio: audio,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) {
          return;
        }
        if (optionsRef.current.sendChunk(event.data)) {
          sentAnyAudio.current = true;
        }
      };

      recorder.onstart = () => {
        setMicState("recording");
        setListening(true);
      };

      recorder.onerror = () => {
        setMicPermission("error");
        setMicError("Recorder error");
        setMicState("error");
        teardown();
      };

      // Fires after the final ondataavailable, so the whole utterance is on the wire.
      recorder.onstop = () => {
        if (sentAnyAudio.current) {
          setMicState("processing");
          optionsRef.current.sendEvent({ type: "stt_commit" });
        } else {
          setMicError("No audio captured from microphone.");
          setMicState("idle");
        }
        setListening(false);
        teardown();
      };

      stream.getTracks().forEach((track) => {
        track.onended = () => stop();
      });

      // Timeslice streams audio while held instead of withholding it until release.
      recorder.start(CHUNK_MS);
    } catch (error) {
      const err = error as { name?: string } | undefined;
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      setMicPermission(denied ? "denied" : "error");
      setMicError(err?.name === "NotFoundError" ? "No microphone device found." : "Microphone permission denied");
      setMicState("error");
      setListening(false);
      teardown();
    } finally {
      startInProgress.current = false;
    }
  }, [setListening, setMicError, setMicPermission, setMicState, stop, teardown]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      void start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      teardown();
    };
  }, [teardown]);

  return { start, stop, toggle };
};
