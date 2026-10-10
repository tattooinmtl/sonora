import { useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audio-engine";
import { createNoise, type NoiseFn } from "@/lib/noise";
import { paletteById } from "@/lib/palettes";
import { useStudio } from "@/lib/studio-store";
import {
  cyclesFor,
  downsample,
  fieldPitchForSeed,
  noteName,
  shapeFromNotes,
  synthesizeCycle,
  type Wave,
} from "@/lib/waves";

const COUNT = 6400;
const COLS = 40;
const ROWS = 26;
const BG = "rgb(9, 10, 12)";

type SimPath = {
  pts: Float32Array;
  count: number;
  color: number;
};

function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function resample(raw: number[], samples: number): SimPath {
  const n = raw.length / 2;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dx = raw[i * 2]! - raw[(i - 1) * 2]!;
    const dy = raw[i * 2 + 1]! - raw[(i - 1) * 2 + 1]!;
    cum[i] = cum[i - 1]! + Math.hypot(dx, dy);
  }
  const total = cum[n - 1] || 1;
  const pts = new Float32Array(samples * 2);
  let j = 1;
  for (let s = 0; s < samples; s++) {
    const d = (s / (samples - 1)) * total;
    while (j < n - 1 && cum[j]! < d) j++;
    const j0 = Math.max(0, j - 1);
    const span = (cum[j] ?? 1) - (cum[j0] ?? 0) || 1;
    const f = ((d - (cum[j0] ?? 0)) / span) || 0;
    pts[s * 2] = raw[j0 * 2]! + (raw[j * 2]! - raw[j0 * 2]!) * f;
    pts[s * 2 + 1] = raw[j0 * 2 + 1]! + (raw[j * 2 + 1]! - raw[j0 * 2 + 1]!) * f;
  }
  return { pts, count: samples, color: 0 };
}

function pointAt(path: SimPath, u: number, lat: number) {
  const s = ((u % 1) + 1) % 1;
  const x = s * (path.count - 1);
  let i = Math.floor(x);
  if (i >= path.count - 1) i = path.count - 2;
  if (i < 0) i = 0;
  const f = x - i;
  const x0 = path.pts[i * 2]!;
  const y0 = path.pts[i * 2 + 1]!;
  const x1 = path.pts[(i + 1) * 2]!;
  const y1 = path.pts[(i + 1) * 2 + 1]!;
  const px = x0 + (x1 - x0) * f;
  const py = y0 + (y1 - y0) * f;
  const tx = x1 - x0;
  const ty = y1 - y0;
  const len = Math.hypot(tx, ty) || 1;
  return [px + (-ty / len) * lat, py + (tx / len) * lat] as const;
}

function buildVoicePath(
  type: Wave,
  midi: number,
  x0: number,
  x1: number,
  yMid: number,
  amp: number,
): SimPath {
  const cycles = cyclesFor(midi);
  const span = Math.max(1, x1 - x0);
  const period = span / cycles;
  const raw: number[] = [];
  const push = (x: number, y: number) => {
    raw.push(x, y);
  };
  if (type === "sine") {
    const n = cycles * 64;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      push(x0 + span * u, yMid + amp * Math.sin(u * cycles * Math.PI * 2));
    }
  } else if (type === "square") {
    for (let c = 0; c < cycles; c++) {
      const x = x0 + c * period;
      push(x, yMid + amp);
      push(x + period * 0.5, yMid + amp);
      push(x + period * 0.5, yMid - amp);
      push(x + period, yMid - amp);
    }
  } else if (type === "triangle") {
    for (let c = 0; c < cycles; c++) {
      const x = x0 + c * period;
      push(x, yMid - amp);
      push(x + period * 0.5, yMid + amp);
      push(x + period, yMid - amp);
    }
  } else {
    for (let c = 0; c < cycles; c++) {
      const x = x0 + c * period;
      push(x, yMid - amp);
      push(x + period * 0.98, yMid + amp);
      push(x + period, yMid - amp);
    }
  }
  return resample(raw, Math.max(240, cycles * 80));
}

function layoutVoices(
  notes: readonly number[],
  type: Wave,
  w: number,
  h: number,
  top: number,
  bottom: number,
  colors: number,
): SimPath[] {
  const sorted = [...notes].sort((a, b) => a - b);
  const usable = Math.max(72, bottom - top);
  const k = sorted.length;
  return sorted.map((midi, i) => {
    const slot = usable / k;
    const yMid = top + slot * (i + 0.5);
    const amp = Math.max(28, Math.min(slot * 0.4, usable * 0.3));
    const path = buildVoicePath(type, midi, w * 0.04, w * 0.96, yMid, amp);
    path.color = i % colors;
    return path;
  });
}

function captureRidge(
  px: Float32Array,
  py: Float32Array,
  count: number,
  w: number,
  h: number,
): { path: SimPath; shape: Float32Array } {
  const bins = 160;
  const vs = 72;
  const hist = new Uint16Array(bins * vs);
  for (let i = 0; i < count; i++) {
    let x = Math.floor((px[i]! / w) * bins);
    let y = Math.floor((py[i]! / h) * vs);
    if (x < 0) x = 0;
    if (x >= bins) x = bins - 1;
    if (y < 0) y = 0;
    if (y >= vs) y = vs - 1;
    hist[y * bins + x] = (hist[y * bins + x] ?? 0) + 1;
  }
  const ys = new Float32Array(bins);
  for (let x = 0; x < bins; x++) {
    let best = -1;
    let by = vs * 0.5;
    for (let y = 0; y < vs; y++) {
      const c = hist[y * bins + x] ?? 0;
      if (c > best) {
        best = c;
        by = y + 0.5;
      }
    }
    ys[x] = (by / vs) * h;
  }
  for (let pass = 0; pass < 4; pass++) {
    const next = ys.slice();
    for (let x = 1; x < bins - 1; x++) {
      next[x] = ((ys[x - 1] ?? 0) + (ys[x] ?? 0) * 2 + (ys[x + 1] ?? 0)) / 4;
    }
    ys.set(next);
  }
  const raw: number[] = [];
  for (let x = 0; x < bins; x++) raw.push((x / (bins - 1)) * w, ys[x]!);
  const path = resample(raw, 420);
  const shape = new Float32Array(bins);
  let mean = 0;
  for (let x = 0; x < bins; x++) {
    shape[x] = (h * 0.5 - ys[x]!) / (h * 0.25);
    mean += shape[x]!;
  }
  mean /= bins;
  let peak = 0;
  for (let x = 0; x < bins; x++) {
    shape[x] = (shape[x] ?? 0) - mean;
    peak = Math.max(peak, Math.abs(shape[x]!));
  }
  if (peak > 0.001) {
    const g = 1 / peak;
    for (let x = 0; x < bins; x++) shape[x] = (shape[x] ?? 0) * g;
  }
  return { path, shape };
}

function publishTone(shape: Float32Array, freq: number, label: string) {
  const cycle = synthesizeCycle(shape);
  audioEngine.playField(cycle, freq);
  const cur = useStudio.getState();
  if (cur.fieldLabel !== label) {
    useStudio.getState().setFieldTone(label, downsample(cycle, 96));
  } else {
    useStudio.getState().setFieldTone(label, downsample(cycle, 96));
  }
}

export function FieldCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const px = new Float32Array(COUNT);
    const py = new Float32Array(COUNT);
    const ppx = new Float32Array(COUNT);
    const ppy = new Float32Array(COUNT);
    const pu = new Float32Array(COUNT);
    const plat = new Float32Array(COUNT);
    const pVoice = new Int16Array(COUNT);
    const pColor = new Uint8Array(COUNT);

    let noise: NoiseFn = createNoise(useStudio.getState().seed);
    let seenSeed = useStudio.getState().seed;
    let w = 1;
    let h = 1;
    let dpr = 1;
    let fieldTime = 0;
    let last = performance.now();
    let raf = 0;
    let cleared = false;
    let pathSig = "";
    let paths: SimPath[] = [];
    let lockedPaths: SimPath[] | null = null;
    let ridge: SimPath | null = null;
    let ridgeSig = "";
    let toneSig = "";
    let lastToneAt = 0;
    let pendingTone: string | null = null;
    let lastExport = useStudio.getState().exportRequest;

    const gx = new Float32Array((COLS + 1) * (ROWS + 1));
    const gy = new Float32Array((COLS + 1) * (ROWS + 1));

    const scatter = () => {
      for (let i = 0; i < COUNT; i++) {
        px[i] = Math.random() * w;
        py[i] = Math.random() * h;
        ppx[i] = px[i]!;
        ppy[i] = py[i]!;
        pu[i] = hash01(i + 2);
        plat[i] = (hash01(i + 9) - 0.5) * 16;
        pVoice[i] = -1;
        pColor[i] = i % 4;
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cleared = false;
      pathSig = "";
      if (px[0] === 0 && py[0] === 0) scatter();
    };

    const updateGrid = (time: number, fn: NoiseFn) => {
      const curl = (x: number, y: number, scale: number) => {
        const e = 16;
        const nU = fn(x * scale, (y + e) * scale + time);
        const nD = fn(x * scale, (y - e) * scale + time);
        const nR = fn((x + e) * scale + time * 0.2, y * scale);
        const nL = fn((x - e) * scale + time * 0.2, y * scale);
        return [nU - nD, nL - nR] as const;
      };
      for (let j = 0; j <= ROWS; j++) {
        for (let i = 0; i <= COLS; i++) {
          const x = (i / COLS) * w;
          const y = (j / ROWS) * h;
          const a = curl(x, y, 0.00115);
          const b = curl(x + 40, y - 20, 0.0024);
          let vx = a[0] * 0.72 + b[0] * 0.28;
          let vy = a[1] * 0.72 + b[1] * 0.28;
          const len = Math.hypot(vx, vy) || 1;
          vx /= len;
          vy /= len;
          const idx = j * (COLS + 1) + i;
          gx[idx] = vx;
          gy[idx] = vy;
        }
      }
    };

    const sample = (x: number, y: number) => {
      const fx = Math.min(COLS - 0.001, Math.max(0, (x / w) * COLS));
      const fy = Math.min(ROWS - 0.001, Math.max(0, (y / h) * ROWS));
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = fx - i;
      const ty = fy - j;
      const stride = COLS + 1;
      const i00 = j * stride + i;
      const i10 = i00 + 1;
      const i01 = i00 + stride;
      const i11 = i01 + 1;
      const vx =
        gx[i00]! * (1 - tx) * (1 - ty) +
        gx[i10]! * tx * (1 - ty) +
        gx[i01]! * (1 - tx) * ty +
        gx[i11]! * tx * ty;
      const vy =
        gy[i00]! * (1 - tx) * (1 - ty) +
        gy[i10]! * tx * (1 - ty) +
        gy[i01]! * (1 - tx) * ty +
        gy[i11]! * tx * ty;
      return [vx, vy] as const;
    };

    const assignVoices = (nVoices: number, ambient: boolean) => {
      let p = 0;
      for (let i = 0; i < COUNT; i++) {
        if (nVoices === 0) pVoice[i] = -1;
        else if (ambient && i % 14 === 0) pVoice[i] = -1;
        else {
          pVoice[i] = p % nVoices;
          p++;
        }
        pu[i] = hash01(i * 1.7 + nVoices * 13 + seenSeed);
      }
    };

    const playFromShape = (shape: Float32Array, freq: number, label: string, sig: string) => {
      publishTone(shape, freq, label);
      toneSig = sig;
      lastToneAt = performance.now();
      pendingTone = null;
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = useStudio.getState();

      if (state.seed !== seenSeed) {
        seenSeed = state.seed;
        noise = createNoise(seenSeed);
        cleared = false;
        pathSig = "";
        lockedPaths = null;
        ridge = null;
        ridgeSig = "";
        toneSig = "";
        scatter();
      }

      if (state.exportRequest !== lastExport) {
        lastExport = state.exportRequest;
        const a = document.createElement("a");
        a.download = `sonora-${state.seed}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
      }

      const colors = paletteById(state.paletteId).colors;
      const openTop = state.topInset;
      const openBottom = Math.max(openTop + 120, h - state.bottomInset);
      const top = openTop + 16;
      const bottom = openBottom - 12;
      const noteKey = state.notes.join(",");
      const voiceSig = `${state.wave}|${noteKey}|${Math.round(w)}|${Math.round(top)}|${Math.round(bottom)}|${state.stabilized ? 1 : 0}`;

      let active: SimPath[] = [];
      if (state.notes.length > 0) {
        if (voiceSig !== pathSig) {
          paths = layoutVoices(state.notes, state.wave, w, h, top, bottom, colors.length);
          pathSig = voiceSig;
          assignVoices(paths.length, !state.stabilized);
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = BG;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
        active = paths;
        if (state.stabilized) lockedPaths = paths;
      } else if (state.stabilized && lockedPaths && lockedPaths.length > 0) {
        active = lockedPaths;
      } else if (!state.stabilized) {
        lockedPaths = null;
        if (pathSig !== "") {
          pathSig = "";
          paths = [];
          assignVoices(0, false);
        }
      }

      if (state.stabilized && state.notes.length === 0 && !lockedPaths) {
        const sig = `ridge|${state.seed}|${Math.round(w)}|${Math.round(h)}`;
        if (!ridge || ridgeSig !== sig) {
          const cap = captureRidge(px, py, COUNT, w, h);
          ridge = cap.path;
          ridge.color = 0;
          ridgeSig = sig;
          assignVoices(1, false);
          for (let i = 0; i < COUNT; i++) pVoice[i] = 0;
          const pitch = fieldPitchForSeed(state.seed);
          playFromShape(cap.shape, pitch.freq, `Field tone · ${noteName(pitch.midi)} · field`, sig);
        }
        active = ridge ? [ridge] : [];
      } else if (!state.stabilized) {
        ridge = null;
        ridgeSig = "";
      }

      if (state.stabilized && state.notes.length > 0) {
        const sig = `notes|${state.wave}|${noteKey}`;
        const due = now - lastToneAt > 140;
        if (sig !== toneSig && (toneSig === "" || due)) {
          const shape = shapeFromNotes(state.wave, state.notes);
          const root = state.notes[0]!;
          const freq = 440 * 2 ** ((root - 69) / 12);
          const kind = state.notes.length > 1 ? "chord" : state.wave;
          playFromShape(shape, freq, `Field tone · ${noteName(root)} · ${kind}`, sig);
        } else if (sig !== toneSig) {
          pendingTone = sig;
        }
      }
      if (pendingTone && now - lastToneAt > 140 && state.stabilized && state.notes.length > 0) {
        const shape = shapeFromNotes(state.wave, state.notes);
        const root = state.notes[0]!;
        const freq = 440 * 2 ** ((root - 69) / 12);
        const kind = state.notes.length > 1 ? "chord" : state.wave;
        playFromShape(
          shape,
          freq,
          `Field tone · ${noteName(root)} · ${kind}`,
          `notes|${state.wave}|${noteKey}`,
        );
      }

      if (!state.paused) {
        fieldTime += dt * 0.045 * state.speed;
        updateGrid(fieldTime, noise);
        const flowPx = 78 * state.speed;
        const along = (state.stabilized ? 0.04 : 0.18) * state.speed;
        const spring = state.stabilized ? 14 : 11;
        const blend = 1 - Math.exp(-spring * dt);
        const spread = state.stabilized ? 0.7 : 2.2;
        const flutterAmp = state.stabilized ? 0 : 0.8;

        for (let i = 0; i < COUNT; i++) {
          ppx[i] = px[i]!;
          ppy[i] = py[i]!;
          const voice = pVoice[i] ?? -1;
          const path = voice >= 0 ? active[voice] : undefined;
          if (path) {
            pu[i] = (pu[i]! + dt * along) % 1;
            const flutter = Math.sin(fieldTime * 1.7 + i * 0.37) * flutterAmp;
            const targetLat = (hash01(i * 3 + 5) - 0.5) * 2 * spread + flutter;
            plat[i] = plat[i]! + (targetLat - plat[i]!) * (1 - Math.exp(-3 * dt));
            const [tx, ty] = pointAt(path, pu[i]!, plat[i]!);
            px[i] = px[i]! + (tx - px[i]!) * blend;
            py[i] = py[i]! + (ty - py[i]!) * blend;
            pColor[i] = path.color;
          } else {
            const [vx, vy] = sample(px[i]!, py[i]!);
            px[i] = px[i]! + vx * flowPx * dt;
            py[i] = py[i]! + vy * flowPx * dt;
            if (px[i]! < 0) px[i] = px[i]! + w;
            if (px[i]! >= w) px[i] = px[i]! - w;
            if (py[i]! < 0) py[i] = py[i]! + h;
            if (py[i]! >= h) py[i] = py[i]! - h;
            pColor[i] = i % colors.length;
          }
        }
      }

      if (!cleared) {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, w, h);
        cleared = true;
      } else if (!state.paused) {
        const fadeBase = 0.22 - state.trail * 0.2;
        const fade = state.notes.length > 0 ? Math.max(fadeBase, 0.18) : fadeBase;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = fade;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const buckets = colors.map(() => new Path2D());
      for (let i = 0; i < COUNT; i++) {
        const dx = px[i]! - ppx[i]!;
        const dy = py[i]! - ppy[i]!;
        const dist2 = dx * dx + dy * dy;
        const c = pColor[i]! % colors.length;
        const b = buckets[c]!;
        if (dist2 > 80 * 80) {
          b.moveTo(px[i]!, py[i]!);
          b.lineTo(px[i]! + 0.9, py[i]! + 0.9);
          continue;
        }
        if (dist2 === 0) continue;
        b.moveTo(ppx[i]!, ppy[i]!);
        b.lineTo(px[i]!, py[i]!);
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = state.stabilized ? 2.4 : 3.2;
      ctx.globalAlpha = state.stabilized ? 0.28 : 0.18;
      for (let c = 0; c < colors.length; c++) {
        ctx.strokeStyle = colors[c]!;
        ctx.stroke(buckets[c]!);
      }
      ctx.lineWidth = state.stabilized ? 1.7 : 1.45;
      ctx.globalAlpha = state.stabilized ? 0.95 : 0.72;
      for (let c = 0; c < colors.length; c++) {
        ctx.strokeStyle = colors[c]!;
        ctx.stroke(buckets[c]!);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (active.length > 0) {
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.35;
        ctx.strokeStyle = colors[0] ?? "#e7e9ee";
        for (const path of active) {
          ctx.beginPath();
          ctx.moveTo(path.pts[0]!, path.pts[1]!);
          const step = Math.max(1, Math.floor(path.count / 400));
          for (let i = step; i < path.count; i += step) {
            ctx.lineTo(path.pts[i * 2]!, path.pts[i * 2 + 1]!);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };

    resize();
    scatter();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full touch-none" aria-hidden />;
}
