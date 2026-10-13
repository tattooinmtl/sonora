import { useEffect, useRef } from "react";
import * as THREE from "three";
import { chladni, modesFor } from "@/lib/chladni";
import { useStudio } from "@/lib/studio-store";
import { midiToFreq } from "@/lib/waves";

const GRAINS = 5200;
const HALF = 2.05;

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
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);

    scene.add(new THREE.AmbientLight(0xd5dde6, 0.55));
    const key = new THREE.DirectionalLight(0xf4f1ea, 2.4);
    key.position.set(2.2, 6.5, 3.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ea0b5, 0.7);
    rim.position.set(-3.5, 2.2, -2);
    scene.add(rim);

    const steel = new THREE.MeshStandardMaterial({
      color: 0x4e565e,
      metalness: 0.94,
      roughness: 0.22,
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.16, 4.7), steel);
    plate.position.y = -0.04;
    scene.add(plate);
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(4.95, 0.08, 4.95),
      new THREE.MeshStandardMaterial({ color: 0x5c656e, metalness: 0.8, roughness: 0.4 }),
    );
    lip.position.y = -0.14;
    scene.add(lip);

    const geo = new THREE.SphereGeometry(0.046, 6, 4);
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xe7d3a4,
      roughness: 0.62,
      metalness: 0.02,
    });
    const sand = new THREE.InstancedMesh(geo, sandMat, GRAINS);
    sand.frustumCulled = false;
    const colors = [new THREE.Color("#e6d3b0"), new THREE.Color("#c4a36a"), new THREE.Color("#8c7048")];
    const tint = new THREE.Color();
    for (let i = 0; i < GRAINS; i++) {
      tint.copy(colors[i % 3]!).multiplyScalar(0.82 + ((i * 17) % 10) / 40);
      sand.setColorAt(i, tint);
    }
    if (sand.instanceColor) sand.instanceColor.needsUpdate = true;
    scene.add(sand);

    const px = new Float32Array(GRAINS);
    const pz = new Float32Array(GRAINS);
    const vx = new Float32Array(GRAINS);
    const vz = new Float32Array(GRAINS);
    const sz = new Float32Array(GRAINS);
    for (let i = 0; i < GRAINS; i++) {
      px[i] = (Math.random() * 2 - 1) * HALF * 0.92;
      pz[i] = (Math.random() * 2 - 1) * HALF * 0.92;
      sz[i] = 0.65 + Math.random() * 0.7;
    }

    const dummy = new THREE.Object3D();
    let sim = 0;
    let last = performance.now();
    let boost = 90;
    let sig = "";
    let raf = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = 32;
      const vFov = (camera.fov * Math.PI) / 180;
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
      const dist = Math.min(2.15 / Math.tan(vFov / 2), 2.15 / Math.tan(hFov / 2)) * 0.86;
      camera.position.set(0.05, dist * 0.93, dist * 0.22);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const state = useStudio.getState();
      if (!state.paused && !reduce) sim += dt;

      const freqs =
        state.notes.length > 0 ? state.notes.map((m) => midiToFreq(m)) : [state.hz];
      const modes = freqs.slice(0, 4).map((f) => modesFor(f, state.scalePlate));
      const drawing = modes.some((mode) => mode.n > 0);
      const nextSig = `${state.hz}|${state.scalePlate ? 1 : 0}|${state.notes.join(",")}`;
      if (nextSig !== sig) {
        sig = nextSig;
        boost = 80;
      }
      const step = boost > 0 ? 0.05 : dt;
      if (boost > 0) boost -= 1;
      const live = (!state.paused && !state.stabilized) || boost > 0;

      const sample = (x: number, z: number) => {
        let s = 0;
        const nx = x / HALF;
        const nz = z / HALF;
        for (const mode of modes) {
          if (mode.n <= 0) continue;
          s += chladni(nx, nz, mode.n, mode.m);
        }
        return s;
      };

      for (let i = 0; i < GRAINS; i++) {
        let x = px[i]!;
        let z = pz[i]!;
        if (live && drawing) {
          const e = 0.035;
          const a0 = Math.abs(sample(x, z));
          const gx = Math.abs(sample(x + e, z)) - Math.abs(sample(x - e, z));
          const gz = Math.abs(sample(x, z + e)) - Math.abs(sample(x, z - e));
          const push = (1.1 + a0 * 6.5) * (reduce ? 2.4 : 1);
          vx[i] = (vx[i]! - gx * push) * 0.72;
          vz[i] = (vz[i]! - gz * push) * 0.72;
          if (a0 < 0.08) {
            vx[i]! *= 0.55;
            vz[i]! *= 0.55;
          }
          x += vx[i]! * step * 4.5;
          z += vz[i]! * step * 4.5;
        } else if (live) {
          const shiver = reduce ? 0 : Math.sin(sim * 36 + i) * 0.01;
          x += shiver;
          z += Math.cos(sim * 29 + i * 0.3) * (reduce ? 0 : 0.01);
          vx[i] = 0;
          vz[i] = 0;
        }
        if (x > HALF) x = HALF;
        if (x < -HALF) x = -HALF;
        if (z > HALF) z = HALF;
        if (z < -HALF) z = -HALF;
        px[i] = x;
        pz[i] = z;
        const hop = drawing ? Math.min(0.16, Math.abs(sample(x, z)) * 0.07) : 0.012;
        dummy.position.set(x, 0.05 + hop, z);
        dummy.scale.setScalar(sz[i]!);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        sand.setMatrixAt(i, dummy.matrix);
      }
      sand.instanceMatrix.needsUpdate = true;
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
      sandMat.dispose();
      steel.dispose();
      (lip.material as THREE.Material).dispose();
      plate.geometry.dispose();
      lip.geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}
