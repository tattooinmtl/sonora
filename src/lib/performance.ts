import { audioEngine } from "@/lib/audio-engine";
import { useStudio } from "@/lib/studio-store";

const holds = new Map<number, number>();

export function pressNote(midi: number) {
  audioEngine.unlock();
  const next = (holds.get(midi) ?? 0) + 1;
  holds.set(midi, next);
  if (next === 1) {
    audioEngine.noteOn(midi, useStudio.getState().wave);
    useStudio.getState().addNote(midi);
  }
}

export function releaseNote(midi: number) {
  const cur = holds.get(midi);
  if (!cur) return;
  if (cur <= 1) {
    holds.delete(midi);
    audioEngine.noteOff(midi);
    useStudio.getState().removeNote(midi);
  } else {
    holds.set(midi, cur - 1);
  }
}

export function bindStudioAudio() {
  audioEngine.setVolume(useStudio.getState().volume);
  const offVis = () => {
    if (document.visibilityState === "visible") audioEngine.resumeIfNeeded();
  };
  document.addEventListener("visibilitychange", offVis);
  const unsub = useStudio.subscribe((s, p) => {
    if (s.volume !== p.volume) audioEngine.setVolume(s.volume);
    if (s.wave !== p.wave) audioEngine.setWave(s.wave);
    if (s.stabilized !== p.stabilized) {
      audioEngine.setKeyDuck(s.stabilized ? 0.2 : 1);
      if (!s.stabilized) audioEngine.stopField();
    }
  });
  return () => {
    document.removeEventListener("visibilitychange", offVis);
    unsub();
  };
}
