import { create } from "zustand";
import type { Wave } from "@/lib/waves";

export type StudioState = {
  speed: number;
  trail: number;
  paletteId: string;
  seed: number;
  paused: boolean;
  wave: Wave;
  volume: number;
  minimized: boolean;
  stabilized: boolean;
  notes: number[];
  octave: number;
  topInset: number;
  bottomInset: number;
  fieldLabel: string | null;
  fieldPreview: number[] | null;
  exportRequest: number;
  setSpeed: (v: number) => void;
  setTrail: (v: number) => void;
  setPalette: (id: string) => void;
  setWave: (wave: Wave) => void;
  setVolume: (v: number) => void;
  setOctave: (midi: number) => void;
  setInsets: (top: number, bottom: number) => void;
  addNote: (midi: number) => void;
  removeNote: (midi: number) => void;
  randomize: () => void;
  togglePause: () => void;
  toggleMin: () => void;
  toggleStabilize: () => void;
  requestExport: () => void;
  setFieldTone: (label: string | null, preview: number[] | null) => void;
};

export const useStudio = create<StudioState>((set) => ({
  speed: 1.15,
  trail: 0.86,
  paletteId: "starlight",
  seed: 24011,
  paused: false,
  wave: "sine",
  volume: 0.75,
  minimized: false,
  stabilized: false,
  notes: [],
  octave: 60,
  topInset: 88,
  bottomInset: 460,
  fieldLabel: null,
  fieldPreview: null,
  exportRequest: 0,
  setSpeed: (speed) => set({ speed }),
  setTrail: (trail) => set({ trail }),
  setPalette: (paletteId) => set({ paletteId }),
  setWave: (wave) => set({ wave }),
  setVolume: (volume) => set({ volume }),
  setOctave: (octave) => set({ octave }),
  setInsets: (topInset, bottomInset) => set({ topInset, bottomInset }),
  addNote: (midi) =>
    set((s) => (s.notes.includes(midi) ? s : { notes: [...s.notes, midi].sort((a, b) => a - b) })),
  removeNote: (midi) => set((s) => ({ notes: s.notes.filter((n) => n !== midi) })),
  randomize: () =>
    set({
      seed: Math.floor(Math.random() * 900000) + 10000,
      stabilized: false,
      fieldLabel: null,
      fieldPreview: null,
    }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  toggleMin: () => set((s) => ({ minimized: !s.minimized })),
  toggleStabilize: () =>
    set((s) => ({
      stabilized: !s.stabilized,
      fieldLabel: s.stabilized ? null : s.fieldLabel,
      fieldPreview: s.stabilized ? null : s.fieldPreview,
    })),
  requestExport: () => set((s) => ({ exportRequest: s.exportRequest + 1 })),
  setFieldTone: (fieldLabel, fieldPreview) => set({ fieldLabel, fieldPreview }),
}));
