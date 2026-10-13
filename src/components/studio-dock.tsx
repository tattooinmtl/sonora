import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Download, Pause, Play, SlidersHorizontal } from "lucide-react";
import { audioEngine } from "@/lib/audio-engine";
import {
  describeHz,
  formatHz,
  hzToSlider,
  plateSentence,
  sliderToHz,
  UNITS,
  unitFor,
  type UnitId,
} from "@/lib/chladni";
import { PALETTES } from "@/lib/palettes";
import { pressNote, releaseNote } from "@/lib/performance";
import { useStudio, type FieldView } from "@/lib/studio-store";
import { noteName, pianoKeys, WAVES, WHITE_KEY_COUNT, type Wave } from "@/lib/waves";

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

function WaveIcon({ type }: { type: Wave }) {
  const d =
    type === "sine"
      ? "M2 12c2.2 0 2.2-8 6-8s3.8 16 6 16 3.8-8 6-8"
      : type === "square"
        ? "M3 16V8h8v8h8V8"
        : type === "triangle"
          ? "M3 16 L8 7 L16 16 L21 8"
          : "M3 16 L12 7 V16 L21 7";
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-7" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const PRESETS = [
  { label: "0.01 Hz", hz: 0.01 },
  { label: "110 Hz", hz: 110 },
  { label: "440 Hz", hz: 440 },
  { label: "1 kHz", hz: 1e3 },
  { label: "20 kHz", hz: 2e4 },
  { label: "1 MHz", hz: 1e6 },
  { label: "1 GHz", hz: 1e9 },
  { label: "74 THz", hz: 74e12 },
] as const;

function ToneGenerator() {
  const hz = useStudio((s) => s.hz);
  const wave = useStudio((s) => s.wave);
  const scalePlate = useStudio((s) => s.scalePlate);
  const read = describeHz(hz);
  const [unit, setUnit] = useState<UnitId>(() => unitFor(hz).id);
  const [text, setText] = useState(() => {
    const u = unitFor(hz);
    return String(hz / u.mul);
  });
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    const u = unitFor(hz);
    setUnit(u.id);
    const shown = hz / u.mul;
    setText(shown >= 100 ? String(Math.round(shown)) : String(Math.round(shown * 1000) / 1000));
  }, [hz]);

  const commit = (raw: string, nextUnit: UnitId) => {
    const mul = UNITS.find((u) => u.id === nextUnit)?.mul ?? 1;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = value * mul;
    audioEngine.unlock();
    useStudio.getState().setHz(next);
    audioEngine.setDrive(useStudio.getState().hz);
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium text-muted">Tone</p>
        <p className="mt-1 font-display text-4xl leading-none tracking-tight text-fg tabular-nums">{formatHz(hz)}</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="block min-w-0 flex-1">
          <span className="sr-only">Frequency</span>
          <input
            className="h-12 w-full rounded-md border border-line bg-surface-2 px-3 text-lg text-fg tabular-nums"
            inputMode="decimal"
            value={text}
            aria-label="Frequency"
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              commit(text, unit);
            }}
            onChange={(e) => {
              setText(e.target.value);
              const value = Number(e.target.value);
              if (Number.isFinite(value) && value > 0) commit(e.target.value, unit);
            }}
          />
        </label>
        <div className="grid grid-cols-5 gap-2 sm:flex" role="group" aria-label="Frequency unit">
          {UNITS.map((u) => {
            const on = unit === u.id;
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setUnit(u.id);
                  const shown = hz / u.mul;
                  const next = shown >= 100 ? String(Math.round(shown)) : String(Math.round(shown * 1000) / 1000);
                  setText(next);
                }}
                className={`h-12 rounded-md border px-3 text-sm font-medium sm:min-w-16 ${
                  on ? "border-fg bg-fg text-bg" : "border-line bg-surface-2 text-fg"
                }`}
              >
                {u.id}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block">
        <span className="sr-only">Frequency slider</span>
        <input
          className="slider"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={hzToSlider(hz)}
          aria-label="Frequency from 0.01 hertz to 100 terahertz"
          onChange={(e) => {
            audioEngine.unlock();
            const next = sliderToHz(Number(e.target.value));
            useStudio.getState().setHz(next);
            audioEngine.setDrive(next);
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              audioEngine.unlock();
              useStudio.getState().setHz(p.hz);
              audioEngine.setDrive(p.hz);
            }}
            className={`h-11 rounded-md border px-3 text-sm font-medium ${
              Math.abs(hz - p.hz) / p.hz < 0.02 ? "border-fg bg-fg text-bg" : "border-line bg-surface-2 text-fg"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WAVES.map((w) => {
          const on = wave === w.id;
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                audioEngine.unlock();
                useStudio.getState().setWave(w.id);
              }}
              className={`flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium ${
                on ? "border-fg bg-fg text-bg" : "border-line bg-surface-2 text-fg"
              }`}
            >
              <WaveIcon type={w.id} />
              <span>{w.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-muted">{plateSentence(hz, scalePlate)}</p>
      {read.resolved ? null : (
        <button
          type="button"
          aria-pressed={scalePlate}
          onClick={() => useStudio.getState().setScalePlate(!scalePlate)}
          className={`h-12 rounded-md text-sm font-medium ${
            scalePlate ? "bg-accent text-bg" : "border border-line bg-surface-2 text-fg"
          }`}
        >
          {scalePlate ? "Showing a scaled figure" : "Show the scaled figure"}
        </button>
      )}
    </section>
  );
}

function Spark({ data }: { data: number[] }) {
  const d = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${i} ${12 - v * 9}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${Math.max(1, data.length - 1)} 24`}
      className="h-8 w-full text-accent"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function StudioDock() {
  const speed = useStudio((s) => s.speed);
  const trail = useStudio((s) => s.trail);
  const paletteId = useStudio((s) => s.paletteId);
  const seed = useStudio((s) => s.seed);
  const paused = useStudio((s) => s.paused);
  const volume = useStudio((s) => s.volume);
  const minimized = useStudio((s) => s.minimized);
  const stabilized = useStudio((s) => s.stabilized);
  const notes = useStudio((s) => s.notes);
  const octave = useStudio((s) => s.octave);
  const fieldLabel = useStudio((s) => s.fieldLabel);
  const fieldPreview = useStudio((s) => s.fieldPreview);
  const view = useStudio((s) => s.view);

  const headerRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const pianoRef = useRef<HTMLDivElement>(null);
  const holds = useRef(new Map<number, number | null>());

  useEffect(() => {
    const measure = () => {
      if (minimized) {
        useStudio.getState().setInsets(16, 72);
        return;
      }
      const top = (headerRef.current?.offsetHeight ?? 72) + 12;
      const bottom = (dockRef.current?.offsetHeight ?? 420) + 8;
      useStudio.getState().setInsets(top, bottom);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    if (dockRef.current) ro.observe(dockRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [minimized, fieldLabel]);

  useEffect(() => {
    const el = pianoRef.current;
    if (!el || minimized) return;
    const c4 = el.querySelector<HTMLElement>('[data-midi="60"]');
    if (!c4) return;
    el.scrollLeft = c4.offsetLeft - el.clientWidth / 2 + c4.clientWidth / 2;
  }, [minimized]);

  useEffect(() => {
    const down = new Map<string, number>();
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === " ") {
        e.preventDefault();
        useStudio.getState().togglePause();
        return;
      }
      if (key === "z") {
        useStudio.getState().setOctave(Math.max(24, useStudio.getState().octave - 12));
        return;
      }
      if (key === "x") {
        useStudio.getState().setOctave(Math.min(84, useStudio.getState().octave + 12));
        return;
      }
      const base = useStudio.getState().octave;
      const wi = "asdfghjkl;".indexOf(key);
      let midi: number | null = null;
      if (wi >= 0) midi = base + WHITE_STEPS[wi]!;
      const bi = "wetyuop".indexOf(key);
      if (bi >= 0) {
        const map = [1, 3, 6, 8, 10, 13, 15];
        midi = base + map[bi]!;
      }
      if (midi == null || midi < 21 || midi > 108) return;
      if (down.has(key)) return;
      e.preventDefault();
      down.set(key, midi);
      audioEngine.unlock();
      pressNote(midi);
    };
    const onUp = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const midi = down.get(key);
      if (midi == null) return;
      down.delete(key);
      releaseNote(midi);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const keys = pianoKeys();
  const whites = keys.filter((k) => !k.black);
  const blacks = keys.filter((k) => k.black);

  const hitMidi = (clientX: number, clientY: number) => {
    const root = pianoRef.current;
    if (!root) return null;
    const nodes = root.querySelectorAll<HTMLElement>("[data-midi]");
    let white: number | null = null;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const midi = Number(el.dataset.midi);
      if (el.dataset.black === "1") return midi;
      white = midi;
    }
    return white;
  };

  const pointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    audioEngine.unlock();
    const midi = hitMidi(e.clientX, e.clientY);
    holds.current.set(e.pointerId, midi);
    if (midi != null) pressNote(midi);
  };
  const pointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!holds.current.has(e.pointerId)) return;
    const prev = holds.current.get(e.pointerId) ?? null;
    const midi = hitMidi(e.clientX, e.clientY);
    if (midi === prev) return;
    if (prev != null) releaseNote(prev);
    holds.current.set(e.pointerId, midi);
    if (midi != null) pressNote(midi);
  };
  const pointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = holds.current.get(e.pointerId);
    if (prev != null) releaseNote(prev);
    holds.current.delete(e.pointerId);
  };

  const noteLine =
    notes.length === 0 ? "No keys held" : notes.map((n) => noteName(n)).join("  ");

  return (
    <>
      <header
        ref={headerRef}
        inert={minimized ? true : undefined}
        aria-hidden={minimized}
        className={`motion-dock pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 safe-top transition-transform duration-fast ease-smooth ${
          minimized ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none tracking-tight text-fg">Sonora</h1>
          <p className="mt-1 text-sm text-muted">Sand on a singing plate</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={paused ? "Resume field" : "Pause field"}
            aria-pressed={paused}
            onClick={() => useStudio.getState().togglePause()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-fg transition-transform duration-quick ease-smooth active:scale-[0.98]"
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Export PNG"
            onClick={() => {
              audioEngine.unlock();
              useStudio.getState().requestExport();
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface text-fg transition-transform duration-quick ease-smooth active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Hide controls"
            onClick={() => useStudio.getState().toggleMin()}
            className="inline-flex h-11 items-center rounded-md border border-line bg-surface px-3 text-sm font-medium text-fg transition-transform duration-quick ease-smooth active:scale-[0.98]"
          >
            Hide
          </button>
        </div>
      </header>

      <div
        ref={dockRef}
        inert={minimized ? true : undefined}
        aria-hidden={minimized}
        className={`motion-dock absolute inset-x-0 bottom-0 z-20 px-3 safe-bottom transition-transform duration-fast ease-smooth sm:px-4 ${
          minimized ? "pointer-events-none translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="dock-scroll panel-shadow mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-4 sm:p-5">
          <ToneGenerator />
          <section className="flex flex-col gap-3">
            <p className="text-sm font-medium text-muted">View</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Field view">
            {(
              [
                ["side", "Side"],
                ["both", "Both"],
                ["top", "Top"],
              ] as const
            ).map(([id, label]) => {
              const on = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => useStudio.getState().setView(id as FieldView)}
                  className={`h-11 rounded-md border text-sm font-medium transition-colors duration-quick ease-smooth ${
                    on ? "border-fg bg-fg text-bg" : "border-line bg-surface-2 text-fg"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          </section>
          <section className="flex flex-col gap-4">
            <p className="text-sm font-medium text-muted">Plate</p>
            <label className="block">
              <span className="flex items-baseline justify-between text-sm font-medium text-muted">
                Volume
                <span className="tabular-nums text-fg">{Math.round(volume * 100)}</span>
              </span>
              <input
                className="slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label="Volume"
                onChange={(e) => useStudio.getState().setVolume(Number(e.target.value))}
              />
            </label>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="flex items-baseline justify-between text-xs font-medium text-muted">
                Speed
                <span className="tabular-nums text-fg">{speed.toFixed(2)}</span>
              </span>
              <input
                className="slider"
                type="range"
                min={0.15}
                max={2.4}
                step={0.01}
                value={speed}
                aria-label="Speed"
                onChange={(e) => useStudio.getState().setSpeed(Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="flex items-baseline justify-between text-xs font-medium text-muted">
                Trail
                <span className="tabular-nums text-fg">{Math.round(trail * 100)}</span>
              </span>
              <input
                className="slider"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={trail}
                aria-label="Trail length"
                onChange={(e) => useStudio.getState().setTrail(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {PALETTES.map((p) => {
              const on = p.id === paletteId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => useStudio.getState().setPalette(p.id)}
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-quick ${
                    on ? "border-fg bg-surface-2 text-fg" : "border-line text-muted"
                  }`}
                >
                  <span className="flex gap-1" aria-hidden>
                    {p.colors.slice(0, 3).map((c) => (
                      <i key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                audioEngine.unlock();
                useStudio.getState().randomize();
              }}
              className="h-11 rounded-md border border-line bg-surface-2 text-sm font-medium text-fg transition-transform duration-quick ease-smooth active:scale-[0.98]"
            >
              Randomize seed
            </button>
            <button
              type="button"
              aria-pressed={stabilized}
              onClick={() => {
                audioEngine.unlock();
                useStudio.getState().toggleStabilize();
              }}
              className={`h-11 rounded-md text-sm font-medium transition-transform duration-quick ease-smooth active:scale-[0.98] ${
                stabilized ? "bg-accent text-bg" : "bg-fg text-bg"
              }`}
            >
              {stabilized ? "Release" : "Stabilize"}
            </button>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-fg">{fieldLabel ?? "Drift, then stabilize to sound the field"}</p>
              <p className="truncate text-xs text-muted tabular-nums">
                Seed {seed}
                <span className="px-2 text-line">·</span>
                {noteLine}
                <span className="px-2 text-line">·</span>
                Keys from {noteName(octave)} · A–L play · Z/X octave · Space pauses
              </p>
            </div>
            {fieldPreview ? (
              <div className="hidden w-36 shrink-0 sm:block">
                <Spark data={fieldPreview} />
              </div>
            ) : null}
          </div>
          {fieldPreview ? (
            <div className="sm:hidden">
              <Spark data={fieldPreview} />
            </div>
          ) : null}

          <section className="flex flex-col gap-3">
            <div>
              <p className="text-sm font-medium text-muted">Piano</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Or hold a key. The plate follows the keys while they are down, then returns to the frequency above.
              </p>
            </div>
            <div
            ref={pianoRef}
            className="relative h-24 overflow-x-auto overflow-y-hidden rounded-md border border-line bg-ebony touch-pan-x"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="relative h-24" style={{ width: `calc(var(--key-w) * ${WHITE_KEY_COUNT})` }}>
              <div className="flex h-24">
                {whites.map((k) => {
                  const on = notes.includes(k.midi);
                  const label = k.midi % 12 === 0 ? noteName(k.midi) : "";
                  return (
                    <button
                      key={k.midi}
                      type="button"
                      data-midi={k.midi}
                      data-black="0"
                      aria-label={noteName(k.midi)}
                      aria-pressed={on}
                      className={`piano-white relative h-24 flex-none border-r border-line text-xs font-medium ${
                        on ? "bg-accent text-bg" : "bg-ivory text-bg"
                      }`}
                    >
                      {label ? <span className="absolute inset-x-0 bottom-1.5 text-center">{label}</span> : null}
                    </button>
                  );
                })}
              </div>
              {blacks.map((k) => {
                const on = notes.includes(k.midi);
                return (
                  <button
                    key={k.midi}
                    type="button"
                    data-midi={k.midi}
                    data-black="1"
                    aria-label={noteName(k.midi)}
                    aria-pressed={on}
                    className={`piano-black absolute top-0 z-10 h-14 rounded-b-sm border border-line ${
                      on ? "bg-accent" : "bg-ebony"
                    }`}
                    style={{ left: `calc(var(--key-w) * ${k.whiteIndex} - var(--key-black) / 2)` }}
                  />
                );
              })}
            </div>
          </div>
          </section>
        </div>
      </div>

      {minimized ? (
        <button
          type="button"
          onClick={() => useStudio.getState().toggleMin()}
          className="safe-fab absolute right-4 z-30 inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-fg fab-shadow"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Studio
        </button>
      ) : null}
    </>
  );
}
