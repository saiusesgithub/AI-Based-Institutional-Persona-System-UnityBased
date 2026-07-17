/**
 * Viseme timeline playback.
 *
 * The backend sends mouth shapes with timings measured against the audio it generated.
 * This module samples that timeline against actual playback position and produces morph
 * target weights. Sampling is deliberately kept out of React state: it runs every frame,
 * and pushing it through a store would re-render the tree 60 times a second.
 */

export type VisemeCue = {
  viseme: string;
  start: number;
  end: number;
};

/** The 15 Oculus visemes, mapped to the morph target names on the GLB. */
export const VISEME_MORPH_TARGETS: Record<string, string> = {
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};

/** Vowels open the jaw; consonants mostly don't. */
const JAW_OPEN_BY_VISEME: Record<string, number> = {
  aa: 1.0,
  O: 0.85,
  E: 0.55,
  U: 0.4,
  I: 0.35,
  CH: 0.3,
  DD: 0.2,
  nn: 0.15,
  RR: 0.25,
  SS: 0.1,
  kk: 0.2,
  TH: 0.15,
  FF: 0.1,
  PP: 0.0,
  sil: 0.0,
};

/**
 * Real mouths start moving toward a shape before the sound and relax after it. Blending
 * neighbouring cues over this window is what stops the mouth looking like it is snapping
 * between poses (coarticulation).
 */
const BLEND_SECONDS = 0.055;

export type VisemeSample = {
  weights: Map<string, number>;
  jaw: number;
  active: boolean;
};

const EMPTY_SAMPLE: VisemeSample = { weights: new Map(), jaw: 0, active: false };

class LipsyncTrack {
  private cues: VisemeCue[] = [];
  private startedAt = 0;
  private endsAt = 0;
  private playing = false;
  /** Cues are time-ordered, so scanning can resume where it left off. */
  private cursor = 0;

  start(cues: VisemeCue[], startedAt: number) {
    this.cues = cues ?? [];
    this.startedAt = startedAt;
    this.endsAt = this.cues.length > 0 ? this.cues[this.cues.length - 1].end : 0;
    this.cursor = 0;
    this.playing = this.cues.length > 0;
  }

  stop() {
    this.playing = false;
    this.cues = [];
    this.cursor = 0;
  }

  hasTimeline() {
    return this.playing;
  }

  /** @param now audio clock time, same clock as the `startedAt` passed to `start()` */
  sample(now: number): VisemeSample {
    if (!this.playing) {
      return EMPTY_SAMPLE;
    }

    const t = now - this.startedAt;
    if (t < -BLEND_SECONDS || t > this.endsAt + BLEND_SECONDS) {
      // Past the end: let the caller relax the mouth closed.
      if (t > this.endsAt + BLEND_SECONDS) {
        this.playing = false;
      }
      return EMPTY_SAMPLE;
    }

    while (this.cursor > 0 && this.cues[this.cursor].end + BLEND_SECONDS > t) {
      this.cursor -= 1;
    }
    while (
      this.cursor < this.cues.length - 1 &&
      this.cues[this.cursor].end + BLEND_SECONDS < t
    ) {
      this.cursor += 1;
    }

    const weights = new Map<string, number>();
    let jaw = 0;

    for (let i = this.cursor; i < this.cues.length; i += 1) {
      const cue = this.cues[i];
      if (cue.start - BLEND_SECONDS > t) {
        break;
      }
      const weight = envelope(t, cue);
      if (weight <= 0.001) {
        continue;
      }
      // Overlapping cues both contribute; the strongest shape wins.
      weights.set(cue.viseme, Math.max(weights.get(cue.viseme) ?? 0, weight));
      jaw = Math.max(jaw, weight * (JAW_OPEN_BY_VISEME[cue.viseme] ?? 0.2));
    }

    return { weights, jaw, active: weights.size > 0 };
  }
}

/**
 * Trapezoid envelope: ramp in before the cue, hold through it, ramp out after. Short cues
 * never reach full strength, which is correct — a fleeting consonant barely forms.
 */
const envelope = (t: number, cue: VisemeCue): number => {
  const attackStart = cue.start - BLEND_SECONDS;
  const releaseEnd = cue.end + BLEND_SECONDS;
  if (t <= attackStart || t >= releaseEnd) {
    return 0;
  }
  if (t < cue.start) {
    return (t - attackStart) / BLEND_SECONDS;
  }
  if (t > cue.end) {
    return 1 - (t - cue.end) / BLEND_SECONDS;
  }
  return 1;
};

export const lipsyncTrack = new LipsyncTrack();
