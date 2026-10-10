/** Seeded 2D gradient noise in roughly [-1, 1]. */
export function createNoise(seed: number) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = rand() % (i + 1);
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;

  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  return function noise(x: number, y: number) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const X = xi & 255;
    const Y = yi & 255;
    const aa = perm[perm[X]! + Y]!;
    const ab = perm[perm[X]! + Y + 1]!;
    const ba = perm[perm[X + 1]! + Y]!;
    const bb = perm[perm[X + 1]! + Y + 1]!;
    const g = (h: number, dx: number, dy: number) => {
      const gx = (h & 1) === 0 ? dx : -dx;
      const gy = (h & 2) === 0 ? dy : -dy;
      return gx + gy;
    };
    const x1 = g(aa, xf, yf) + (g(ba, xf - 1, yf) - g(aa, xf, yf)) * u;
    const x2 = g(ab, xf, yf - 1) + (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1)) * u;
    return x1 + (x2 - x1) * v;
  };
}

export type NoiseFn = (x: number, y: number) => number;
