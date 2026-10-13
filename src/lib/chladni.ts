/** This plate is about 18 cm across. Its first figure sits near 86 Hz. */
export const PLATE_F0 = 86;
export const PLATE_MM = 180;
export const GRAIN_MM = 0.35;
export const MAX_MODE = 22;

export const HZ_MIN = 0.01;
export const HZ_MAX = 100e12;

export const UNITS = [
  { id: "Hz", mul: 1 },
  { id: "kHz", mul: 1e3 },
  { id: "MHz", mul: 1e6 },
  { id: "GHz", mul: 1e9 },
  { id: "THz", mul: 1e12 },
] as const;

export type UnitId = (typeof UNITS)[number]["id"];

export type PlateRead = {
  hz: number;
  n: number;
  m: number;
  resolved: boolean;
  spacingMm: number;
  audible: boolean;
  kind: "infrasound" | "tone" | "ultrasound" | "radio" | "infrared" | "light";
};

function trimNum(n: number) {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  const text =
    abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : abs >= 1 ? n.toFixed(2) : n.toPrecision(2);
  return text.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function formatHz(hz: number) {
  const f = Math.abs(hz);
  if (f >= 1e12) return `${trimNum(hz / 1e12)} THz`;
  if (f >= 1e9) return `${trimNum(hz / 1e9)} GHz`;
  if (f >= 1e6) return `${trimNum(hz / 1e6)} MHz`;
  if (f >= 1e3) return `${trimNum(hz / 1e3)} kHz`;
  return `${trimNum(hz)} Hz`;
}

export function unitFor(hz: number) {
  const f = Math.abs(hz);
  if (f >= 1e12) return UNITS[4];
  if (f >= 1e9) return UNITS[3];
  if (f >= 1e6) return UNITS[2];
  if (f >= 1e3) return UNITS[1];
  return UNITS[0];
}

export function clampHz(hz: number) {
  if (!Number.isFinite(hz)) return 440;
  return Math.min(HZ_MAX, Math.max(HZ_MIN, hz));
}

export function hzToSlider(hz: number) {
  const a = Math.log10(HZ_MIN);
  const b = Math.log10(HZ_MAX);
  const t = (Math.log10(clampHz(hz)) - a) / (b - a);
  return Math.round(Math.min(1, Math.max(0, t)) * 1000);
}

export function sliderToHz(v: number) {
  const a = Math.log10(HZ_MIN);
  const b = Math.log10(HZ_MAX);
  return 10 ** (a + (Math.min(1000, Math.max(0, v)) / 1000) * (b - a));
}

function kindFor(hz: number): PlateRead["kind"] {
  if (hz < 20) return "infrasound";
  if (hz <= 20000) return "tone";
  if (hz < 1e6) return "ultrasound";
  if (hz < 300e9) return "radio";
  if (hz < 400e12) return "infrared";
  return "light";
}

/** True (m, n) for this plate. `resolved` means a grain can still sit on a nodal line. */
export function describeHz(hz: number): PlateRead {
  const f = clampHz(hz);
  const k = Math.sqrt(f / PLATE_F0);
  let n = Math.max(1, Math.round(k * 0.86));
  let m = Math.max(1, Math.round(k * 0.62));
  if (n === m) m += 1;
  const spacingMm = PLATE_MM / Math.max(n, m);
  const resolved = spacingMm >= GRAIN_MM * 4 && Math.max(n, m) <= MAX_MODE;
  return {
    hz: f,
    n,
    m,
    resolved,
    spacingMm,
    audible: f >= 20 && f <= 20000,
    kind: kindFor(f),
  };
}

export function modesFor(hz: number, scale: boolean) {
  const d = describeHz(hz);
  if (d.resolved) return { n: d.n, m: d.m, resolved: true };
  if (!scale) return { n: 0, m: 0, resolved: false };
  const t = Math.log10(d.hz / 20) / Math.log10(HZ_MAX / 20);
  const n = Math.min(MAX_MODE, 8 + Math.round(Math.min(1, Math.max(0, t)) * 12));
  let m = Math.max(1, n - 1 - (Math.round(Math.log10(d.hz)) % 3));
  if (m === n) m = Math.max(1, n - 1);
  return { n, m, resolved: false };
}

/** Free-plate Chladni figure. x and y are -1..1. Sand rests where this is near zero. */
export function chladni(x: number, y: number, n: number, m: number) {
  const X = (x + 1) * 0.5;
  const Y = (y + 1) * 0.5;
  return (
    Math.cos(n * Math.PI * X) * Math.cos(m * Math.PI * Y) -
    Math.cos(m * Math.PI * X) * Math.cos(n * Math.PI * Y)
  );
}

function gapText(mm: number) {
  if (mm >= 1) return `${mm.toFixed(mm >= 10 ? 0 : 1)} mm`;
  if (mm >= 0.001) return `${(mm * 1000).toFixed(1)} μm`;
  return `${(mm * 1e6).toFixed(0)} nm`;
}

function lightText(hz: number) {
  const m = 299792458 / hz;
  if (m >= 1e-3) return `${(m * 1000).toFixed(1)} mm`;
  if (m >= 1e-6) return `${(m * 1e6).toFixed(2)} μm`;
  return `${(m * 1e9).toFixed(1)} nm`;
}

export function plateSentence(hz: number, scale: boolean) {
  const d = describeHz(hz);
  const freq = formatHz(d.hz);
  if (d.kind === "infrasound") {
    return `${freq} is slower than hearing. The plate barely rocks, and the sand drifts toward a single still line. A speaker cannot hold a tone this low.`;
  }
  if (d.resolved && d.audible) {
    return `${freq} is a real tone on this plate. Sand walks onto the still lines and leaves the metal bare where the plate is moving.`;
  }
  if (d.resolved) {
    return `${freq} is above hearing, so you will not hear it. The plate is still large enough for the sand to draw the figure.`;
  }
  const gap = gapText(d.spacingMm);
  const wave =
    d.kind === "infrared" || d.kind === "light"
      ? `${freq} is ${d.kind === "infrared" ? "infrared light" : "light"}, wavelength ${lightText(d.hz)} — not a sound.`
      : `${freq} is ${d.kind}. Sound from a speaker stops near 20 kHz.`;
  if (scale) {
    return `${wave} The true lines would be ${gap} apart, smaller than a grain. The figure on the plate is the same family of pattern, scaled up so you can see it.`;
  }
  return `${wave} Lines would be ${gap} apart — smaller than a grain of sand — so the grains only shimmer. They cannot draw the figure.`;
}
