export type Wave = "sine" | "square" | "triangle" | "sawtooth";

export const WAVES: readonly { id: Wave; label: string }[] = [
  { id: "sine", label: "Sine" },
  { id: "square", label: "Square" },
  { id: "triangle", label: "Triangle" },
  { id: "sawtooth", label: "Saw" },
];

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function midiToFreq(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function noteName(midi: number) {
  const name = NAMES[((midi % 12) + 12) % 12]!;
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

/** Spatial cycles. Mid notes stay readable; each octave adds wiggles. */
export function cyclesFor(midi: number) {
  const c = Math.round(2 ** ((midi - 60) / 12));
  return Math.max(1, Math.min(8, c));
}

/** One cycle, phase in turns (0–1). Matches the geometry drawn on the field. */
export function waveSample(type: Wave, phase: number) {
  const p = phase - Math.floor(phase);
  switch (type) {
    case "sine":
      return Math.sin(p * Math.PI * 2);
    case "square":
      return p < 0.5 ? 1 : -1;
    case "triangle":
      return 1 - 4 * Math.abs(p - 0.5);
    case "sawtooth":
      return 2 * p - 1;
    default:
      return 0;
  }
}

export type PianoKey = { midi: number; black: boolean; whiteIndex: number };

const BLACK = new Set([1, 3, 6, 8, 10]);

/** A0 (21) through C8 (108). */
export function pianoKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  let whiteIndex = 0;
  for (let midi = 21; midi <= 108; midi++) {
    const black = BLACK.has(midi % 12);
    if (black) keys.push({ midi, black, whiteIndex });
    else {
      keys.push({ midi, black, whiteIndex });
      whiteIndex += 1;
    }
  }
  return keys;
}

export const WHITE_KEY_COUNT = pianoKeys().filter((k) => !k.black).length;

const FIELD_SCALE = [36, 40, 43, 45, 48, 52, 55, 57, 60, 64] as const;

export function fieldPitchForSeed(seed: number) {
  const note = FIELD_SCALE[Math.abs(seed) % FIELD_SCALE.length]!;
  return { midi: note, freq: midiToFreq(note) };
}

/**
 * Band-limit a single cycle so the buffer loops without a click and still
 * carries the shape (sine stays sinusoidal, square keeps its odd harmonics).
 */
export function synthesizeCycle(shape: Float32Array, harmonics = 24, outN = 2048) {
  const n = shape.length;
  const spec: { re: number; im: number }[] = [];
  for (let h = 1; h <= harmonics; h++) {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI * h) / n;
    for (let i = 0; i < n; i++) {
      const a = w * i;
      const s = shape[i] ?? 0;
      re += s * Math.cos(a);
      im -= s * Math.sin(a);
    }
    spec.push({ re: (2 * re) / n, im: (2 * im) / n });
  }
  const out = new Float32Array(outN);
  let peak = 0;
  for (let i = 0; i < outN; i++) {
    const t = (2 * Math.PI * i) / outN;
    let s = 0;
    for (let h = 1; h <= harmonics; h++) {
      const c = spec[h - 1]!;
      s += c.re * Math.cos(h * t) + c.im * Math.sin(h * t);
    }
    out[i] = s;
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  if (peak > 0.0001) {
    const g = 0.9 / peak;
    for (let i = 0; i < outN; i++) out[i] = (out[i] ?? 0) * g;
  }
  return out;
}

/** Horizontal scan of every held tone, one period of the lowest note. */
export function shapeFromNotes(type: Wave, notes: readonly number[]) {
  const n = 256;
  const root = Math.min(...notes);
  const rootF = midiToFreq(root);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let s = 0;
    for (const m of notes) s += waveSample(type, t * (midiToFreq(m) / rootF));
    out[i] = s / notes.length;
  }
  return out;
}

export function downsample(samples: Float32Array, bins: number) {
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    const idx = Math.floor((i / (bins - 1)) * (samples.length - 1));
    out.push(samples[idx] ?? 0);
  }
  return out;
}
