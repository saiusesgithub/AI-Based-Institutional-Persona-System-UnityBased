import { useAudioStore } from "@/store/useAudioStore";

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let analyserData: Uint8Array | null = null;
let analyserLoopRunning = false;

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
    analyserData = new Uint8Array(analyser.frequencyBinCount);
  }
  return audioContext;
};

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

export const playAudioBase64 = async (base64: string) => {
  const context = ensureContext();
  if (!context || !analyser) {
    return;
  }

  const buffer = await context.decodeAudioData(base64ToArrayBuffer(base64));
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(context.destination);

  useAudioStore.getState().setSpeaking(true);
  startAnalyserLoop();

  source.onended = () => {
    useAudioStore.getState().setSpeaking(false);
  };

  if (context.state === "suspended") {
    await context.resume();
  }

  source.start();
};
