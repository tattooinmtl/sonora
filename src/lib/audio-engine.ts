import type { Wave } from "@/lib/waves";

type Voice = { osc: OscillatorNode; gain: GainNode };

class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<number, Voice>();
  private field: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private drive: { osc: OscillatorNode; gain: GainNode } | null = null;
  private vol = 0.75;
  private wave: Wave = "sine";
  private duck = 1;

  unlock() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyVolume(0);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) {
    this.vol = v;
    this.applyVolume(0.03);
  }

  private applyVolume(tau: number) {
    if (!this.master || !this.ctx) return;
    const g = this.vol * this.vol * 0.55;
    if (tau <= 0) this.master.gain.value = g;
    else this.master.gain.setTargetAtTime(g, this.ctx.currentTime, tau);
  }

  setWave(wave: Wave) {
    this.wave = wave;
    for (const v of this.voices.values()) v.osc.type = wave;
    if (this.drive) this.drive.osc.type = wave;
  }

  setKeyDuck(duck: number) {
    this.duck = duck;
    this.refreshVoiceGains();
    this.refreshDrive();
  }

  private level() {
    return (0.22 / Math.sqrt(Math.max(1, this.voices.size))) * this.duck;
  }

  private refreshVoiceGains() {
    if (!this.ctx) return;
    const target = this.level();
    const t = this.ctx.currentTime;
    for (const v of this.voices.values()) v.gain.gain.setTargetAtTime(target, t, 0.03);
  }

  noteOn(midi: number, wave: Wave) {
    this.unlock();
    if (!this.ctx || !this.master || this.voices.has(midi)) return;
    this.wave = wave;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    this.voices.set(midi, { osc, gain });
    this.refreshVoiceGains();
  }

  noteOff(midi: number) {
    const v = this.voices.get(midi);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.voices.delete(midi);
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.linearRampToValueAtTime(0, t + 0.06);
    v.osc.stop(t + 0.07);
    this.refreshVoiceGains();
  }

  /** Play hz only inside what a sound card can actually emit. */
  setDrive(hz: number) {
    this.unlock();
    if (!this.ctx || !this.master) return;
    const ceiling = Math.min(18000, this.ctx.sampleRate * 0.45);
    if (!(hz >= 20 && hz <= ceiling)) {
      this.stopDrive();
      return;
    }
    if (!this.drive) {
      const osc = this.ctx.createOscillator();
      osc.type = this.wave;
      osc.frequency.value = hz;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.drive = { osc, gain };
    }
    const t = this.ctx.currentTime;
    this.drive.osc.type = this.wave;
    this.drive.osc.frequency.setTargetAtTime(hz, t, 0.02);
    this.refreshDrive();
  }

  private refreshDrive() {
    if (!this.drive || !this.ctx) return;
    this.drive.gain.gain.setTargetAtTime(0.11 * this.duck, this.ctx.currentTime, 0.03);
  }

  private stopDrive() {
    if (!this.drive || !this.ctx) return;
    const { osc, gain } = this.drive;
    this.drive = null;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.linearRampToValueAtTime(0, t + 0.05);
    osc.stop(t + 0.06);
  }

  playField(samples: Float32Array, freq: number) {
    this.unlock();
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = (freq * samples.length) / ctx.sampleRate;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 4200;
    filter.Q.value = 0.4;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.55, now + 0.08);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    const prev = this.field;
    this.field = { src, gain };
    if (prev) {
      prev.gain.gain.cancelScheduledValues(now);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, now);
      prev.gain.gain.linearRampToValueAtTime(0, now + 0.06);
      prev.src.stop(now + 0.07);
    }
  }

  stopField() {
    if (!this.field || !this.ctx) return;
    const { src, gain } = this.field;
    this.field = null;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    src.stop(t + 0.09);
  }

  resumeIfNeeded() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }
}

export const audioEngine = new AudioEngine();
