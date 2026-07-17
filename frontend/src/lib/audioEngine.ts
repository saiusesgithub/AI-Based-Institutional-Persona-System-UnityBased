import { useAudioStore } from "@/store/useAudioStore";
import { lipsyncTrack, type VisemeCue } from "@/lib/lipsync";

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let analyserData: Uint8Array<ArrayBuffer> | null = null;
let analyserLoopRunning = false;
let currentSource: AudioBufferSourceNode | null = null;

const ensureContext = () => {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.7;
    analyserData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }
  return audioContext;
};

/** Audio-clock position, the same clock the viseme timeline is sampled against. */
export const getAudioTime = () => audioContext?.currentTime ?? 0;

const startAnalyserLoop = () => {
  if (analyserLoopRunning || !analyser || !analyserData) {
    return;
  }
  analyserLoopRunning = true;

  const tick = () => {
    if (!analyser || !analyserData) {
      analyserLoopRunning = false;
      return;
    }

    analyser.getByteTimeDomainData(analyserData);
    let sum = 0;
    for (let i = 0; i < analyserData.length; i += 1) {
      const v = (analyserData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / analyserData.length);
    useAudioStore.getState().setAmplitude(Math.min(rms * 2.2, 1));
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
};

const base64ToArrayBuffer = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const stopAudio = () => {
  if (currentSource) {
    currentSource.onended = null;
    try {
      currentSource.stop();
    } catch {
      // Already stopped; nothing to do.
    }
    currentSource = null;
  }
  lipsyncTrack.stop();
  useAudioStore.getState().setSpeaking(false);
};

/**
 * Play a TTS clip and drive lipsync from its viseme timeline.
 *
 * `visemes` carries timings measured against this exact audio. When it is empty (a
 * provider gave us no timing), the avatar falls back to amplitude-driven mouth motion.
 */
export const playAudioBase64 = async (base64: string, visemes: VisemeCue[] = []) => {
  const context = ensureContext();
  if (!context || !analyser) {
    return;
  }

  // A barge-in should replace the current reply, not talk over it.
  stopAudio();

  const buffer = await context.decodeAudioData(base64ToArrayBuffer(base64));

  if (context.state === "suspended") {
    await context.resume();
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(context.destination);
  currentSource = source;

  useAudioStore.getState().setSpeaking(true);
  startAnalyserLoop();

  source.onended = () => {
    if (currentSource === source) {
      currentSource = null;
      lipsyncTrack.stop();
      useAudioStore.getState().setSpeaking(false);
    }
  };

  // Start the clock and the timeline together so cue times line up with what is heard.
  // `resume()` above is awaited first, since a suspended context does not advance time.
  const startAt = context.currentTime;
  lipsyncTrack.start(visemes, startAt);
  source.start(startAt);
};
