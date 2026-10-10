import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createNoise, type NoiseFn } from "@/lib/noise";
import { paletteById } from "@/lib/palettes";
import { useStudio } from "@/lib/studio-store";
import { cyclesFor, waveSample, type Wave } from "@/lib/waves";

const PLATE_W = 7.4;
const PLATE_D = 4.6;
const SEG_X = 120;
const SEG_Z = 76;

function plateHeight(
  x: number,
  z: number,
  t: number,
  notes: readonly number[],
  wave: Wave,
  noise: NoiseFn,
  seed: number,
) {
  const nx = x / (PLATE_W * 0.5);
  const nz = z / (PLATE_D * 0.5);
  const edge = Math.max(Math.abs(nx), Math.abs(nz));
  const falloff = edge >= 1 ? 0 : Math.min(1, (1 - edge) / 0.12);

  if (notes.length === 0) {
    const n =
      noise(x * 1.15 + t * 0.18, z * 1.15) * 0.62 +
      noise(x * 2.4 - t * 0.07 + 3.2, z * 2.1) * 0.38;
    return n * 0.34 * falloff;
  }

  let h = 0;
  const count = notes.length;
  const spin = ((seed % 997) / 997) * 0.5;
  for (let i = 0; i < count; i++) {
    const midi = notes[i]!;
    const ripples = Math.min(10, 3.2 + cyclesFor(midi) * 1.7);
    const ang = count === 1 ? 0 : spin + (i - (count - 1) / 2) * (Math.PI / Math.max(2, count));
    const proj = nx * Math.cos(ang) + nz * Math.sin(ang);
    const travel = t * (0.18 + Math.max(0, midi - 36) * 0.0035);
    h += waveSample(wave, proj * ripples * 0.5 + travel);
  }
  return (h / Math.sqrt(count)) * 0.92 * falloff;
}

export function TopField() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x090a0c, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.dataset.sonora = "top";
    renderer.domElement.className = "absolute inset-0 h-full w-full touch-none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
    camera.position.set(0.05, 6.55, 1.05);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xc5cdd8, 0.42));
    const key = new THREE.DirectionalLight(0xf4f1ea, 2.1);
    key.position.set(1.6, 6.4, 2.2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8ea0b5, 0.55);
    fill.position.set(-3.2, 2.4, -1.6);
    scene.add(fill);

    const geo = new THREE.PlaneGeometry(PLATE_W, PLATE_D, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position!;
    const count = pos.count;
    const baseX = new Float32Array(count);
    const baseZ = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      baseX[i] = pos.getX(i);
      baseZ[i] = pos.getZ(i);
    }
    const colors = new Float32Array(count * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.22,
      roughness: 0.46,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);

    const low = new THREE.Color();
    const mid = new THREE.Color();
    const high = new THREE.Color();
    const ink = new THREE.Color("#090a0c");
    const tint = new THREE.Color();
    let noise: NoiseFn = createNoise(useStudio.getState().seed);
    let seenSeed = useStudio.getState().seed;
    let seenPalette = "";
    let sim = 0;
    let locked = 0;
    let wasStable = false;
    let last = performance.now();
    let raf = 0;

    const paint = (h: number, i: number) => {
      const t = Math.max(0, Math.min(1, h / 0.92 + 0.5));
      if (t < 0.5) tint.copy(low).lerp(mid, t * 2);
      else tint.copy(mid).lerp(high, (t - 0.5) * 2);
      tint.lerp(ink, (1 - t) * 0.55);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect > 2.2 ? 26 : 32;
      camera.updateProjectionMatrix();
      const vFov = (camera.fov * Math.PI) / 180;
      const dist = aspect > 2.2 ? 5.6 : 4.8;
      const visH = 2 * dist * Math.tan(vFov / 2);
      const visW = visH * aspect;
      mesh.scale.set((visW / PLATE_W) * 0.98, 1, (visH / PLATE_D) * 0.92);
      camera.position.set(0.12, dist, aspect > 2.2 ? dist * 0.12 : dist * 0.42);
      camera.lookAt(0, 0, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const state = useStudio.getState();

      if (state.seed !== seenSeed) {
        seenSeed = state.seed;
        noise = createNoise(seenSeed);
      }
      if (state.paletteId !== seenPalette) {
        seenPalette = state.paletteId;
        const palette = paletteById(state.paletteId).colors;
        low.set(palette[3] ?? palette[0]!);
        mid.set(palette[1] ?? palette[0]!);
        high.set(palette[0]!);
      }

      if (!state.paused && !reduce) sim += dt * state.speed;
      if (state.stabilized && !wasStable) locked = sim;
      wasStable = state.stabilized;
      const t = state.stabilized ? locked : sim;

      const notes = state.notes;
      for (let i = 0; i < count; i++) {
        const y = plateHeight(baseX[i]!, baseZ[i]!, t, notes, state.wave, noise, seenSeed);
        pos.setY(i, y);
        paint(y, i);
      }
      pos.needsUpdate = true;
      geo.attributes.color!.needsUpdate = true;
      geo.computeVertexNormals();
      renderer.render(scene, camera);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
