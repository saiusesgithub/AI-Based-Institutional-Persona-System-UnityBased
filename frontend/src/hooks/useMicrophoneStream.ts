"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

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

const SEGMENT_MS = 1500;

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
  const setMicState = useAppStore((state) => state.setMicState);
  const setMicError = useAppStore((state) => state.setMicError);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const dataTimerRef = useRef<number | null>(null);
  const audioMetaRef = useRef<{ contentType: string; filename: string } | null>(null);
  const startInProgressRef = useRef(false);
  const zeroChunkCountRef = useRef(0);

  const stopSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      window.clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const stopDataTimer = useCallback(() => {
    if (dataTimerRef.current) {
      window.clearInterval(dataTimerRef.current);
      dataTimerRef.current = null;
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
      setMicState("processing");
      sendEvent({ type: "stt_commit" });
      setMicState("listening");
      sendEvent({
        type: "stt_start",
        content_type: meta.contentType,
        filename: meta.filename,
        language,
        persona,
        include_audio: includeAudio,
      });
    }, SEGMENT_MS);
  }, [includeAudio, language, persona, sendEvent, setMicState]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setListening(false);
    setMicState("idle");
    sendEvent({ type: "stt_commit" });
    stopSegmentTimer();
    stopDataTimer();
  }, [sendEvent, setListening, setMicState, stopDataTimer, stopSegmentTimer]);

  const start = useCallback(async () => {
    if (listening || startInProgressRef.current) {
      return;
    }
    startInProgressRef.current = true;
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setListening(false);
        setMicPermission("denied");
        setMicError("Microphone requires HTTPS or localhost.");
        setMicState("error");
        startInProgressRef.current = false;
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setMicPermission("error");
        setMicError("Browser does not support microphone recording.");
        setMicState("error");
        startInProgressRef.current = false;
        return;
      }

      setMicState("requesting_permission");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      console.info("[mic] permission granted");
      console.info("[mic] audio stream created");
      setMicPermission("granted");
      setMicError(null);

      stream.getTracks().forEach((track) => {
        track.enabled = true;
        const settings = track.getSettings?.();
        console.info("[mic] track state", {
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          settings,
        });
        track.onended = () => {
          setMicState("disconnected");
          stop();
        };
      });
      stream.oninactive = () => {
        setMicState("disconnected");
        stop();
      };

      const mimeType = pickMimeType();
      console.info("[mic] selected mime", mimeType ?? "default");
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch (initError) {
        setMicPermission("error");
        setMicError("MediaRecorder failed to initialize.");
        setMicState("error");
        startInProgressRef.current = false;
        return;
      }
      recorderRef.current = recorder;
      const contentType = (mimeType || "audio/webm").split(";")[0];
      const filename = contentType.includes("ogg") ? "audio.ogg" : "audio.webm";
      audioMetaRef.current = { contentType, filename };

      sendEvent({
        type: "stt_start",
        content_type: contentType,
        filename,
        language,
        persona,
        include_audio: includeAudio,
      });

      setMicState("listening");

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          zeroChunkCountRef.current = 0;
          console.info("[mic] chunk received", event.data.size);
          if (muted) {
            console.info("[mic] muted, skipping send");
            return;
          }
          console.info("[mic] sending audio chunk");
          const sent = sendChunk(event.data);
          console.info("[mic] chunk sent", sent);
          if (!sent) {
            console.info("[mic] websocket not open, chunk dropped");
          }
        } else {
          zeroChunkCountRef.current += 1;
          console.info("[mic] chunk size 0", zeroChunkCountRef.current);
          if (zeroChunkCountRef.current >= 3) {
            setMicError("No audio captured from microphone.");
            setMicState("error");
          }
        }
      };

      recorder.onerror = () => {
        setMicPermission("error");
        setMicError("Recorder error");
        setMicState("error");
      };

      recorder.onstart = () => {
        console.info("[mic] recording started");
        setMicState("recording");
      };

      recorder.onstop = () => {
        console.info("[mic] recording stopped");
        stopSegmentTimer();
      };

      zeroChunkCountRef.current = 0;
      recorder.start();
      dataTimerRef.current = window.setInterval(() => {
        recorder.requestData();
      }, 1000);
      setListening(true);
      startSegmentTimer();
    } catch (error) {
      setListening(false);
      const err = error as { name?: string } | undefined;
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      const notFound = err?.name === "NotFoundError";
      setMicPermission(denied ? "denied" : "error");
      setMicError(notFound ? "No microphone device found." : "Microphone permission denied");
      setMicState("error");
    } finally {
      startInProgressRef.current = false;
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
    setMicState,
    setMicError,
    startSegmentTimer,
    stop,
    stopSegmentTimer,
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
