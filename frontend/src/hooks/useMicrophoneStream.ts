"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

const pickMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
};

type UseMicrophoneStreamOptions = {
  sendChunk: (blob: Blob) => void;
  sendEvent: (payload: Record<string, unknown>) => void;
  persona?: string;
  language?: string;
  includeAudio?: boolean;
};

export const useMicrophoneStream = ({
  sendChunk,
  sendEvent,
  persona,
  language = "auto",
  includeAudio = true,
}: UseMicrophoneStreamOptions) => {
  const listening = useAppStore((state) => state.listening);
  const muted = useAppStore((state) => state.muted);
  const setListening = useAppStore((state) => state.setListening);
  const setMicPermission = useAppStore((state) => state.setMicPermission);
  const setMicError = useAppStore((state) => state.setMicError);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const audioMetaRef = useRef<{ contentType: string; filename: string } | null>(null);

  const stopSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      window.clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const startSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      return;
    }
    segmentTimerRef.current = window.setInterval(() => {
      const meta = audioMetaRef.current;
      if (!meta) {
        return;
      }
      sendEvent({ type: "stt_commit" });
      sendEvent({
        type: "stt_start",
        content_type: meta.contentType,
        filename: meta.filename,
        language: "auto",
      });
    }, 4200);
  }, [sendEvent]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setListening(false);
    sendEvent({ type: "stt_commit" });
    stopSegmentTimer();
  }, [sendEvent, setListening, stopSegmentTimer]);

  const start = useCallback(async () => {
    if (listening) {
      return;
    }
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setListening(false);
        setMicPermission("denied");
        setMicError("Microphone requires HTTPS or localhost.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicPermission("granted");
      setMicError(null);

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const contentType = mimeType || "audio/webm";
      const filename = mimeType?.includes("ogg") ? "audio.ogg" : "audio.webm";
      audioMetaRef.current = { contentType, filename };

      sendEvent({
        type: "stt_start",
        content_type: contentType,
        filename,
        language,
        persona,
        include_audio: includeAudio,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && !muted) {
          sendChunk(event.data);
        }
      };

      recorder.onerror = () => {
        setMicPermission("error");
        setMicError("Recorder error");
      };

      recorder.start(240);
      setListening(true);
      startSegmentTimer();
    } catch (error) {
      setListening(false);
      setMicPermission("denied");
      setMicError("Microphone permission denied");
    }
  }, [
    includeAudio,
    language,
    listening,
    muted,
    persona,
    sendChunk,
    sendEvent,
    setListening,
    setMicPermission,
    setMicError,
    startSegmentTimer,
  ]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      void start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    if (muted && listening) {
      stop();
    }
  }, [muted, listening, stop]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, toggle };
};
