// Kare-bazlı, durumsuz animasyon yardımcıları. Her değer yalnızca frame'in
// fonksiyonudur — Remotion kareleri paralel ve sırasız render edebilir.

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mix3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
export type V3 = [number, number, number];

/** [a,b] aralığında 0→1 ilerleme. */
export const prog = (f: number, a: number, b: number) => clamp((f - a) / (b - a));

// Apple tarzı eğriler
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInExpo = (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutQuint = (t: number) =>
  t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeInOutExpo = (t: number) =>
  t <= 0
    ? 0
    : t >= 1
      ? 1
      : t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;
export const easeOutBack = (t: number, s = 1.4) =>
  1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

/** Kritik sönümlü yay (0→1), frame cinsinden. */
export const springy = (f: number, stiffness = 0.18, damping = 0.72) => {
  if (f <= 0) return 0;
  const w = Math.sqrt(stiffness);
  const z = damping;
  if (z >= 1) return 1 - Math.exp(-w * f) * (1 + w * f);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * f) * (Math.cos(wd * f) + ((z * w) / wd) * Math.sin(wd * f));
};

/** Deterministik sözde-rastgele (mulberry32). */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Anahtar kareler arasında yumuşak geçiş: [[frame, value], ...]. */
export const keys = (f: number, ks: [number, number][], ease = easeInOutCubic) => {
  if (f <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const [fa, va] = ks[i];
    const [fb, vb] = ks[i + 1];
    if (f <= fb) return lerp(va, vb, ease((f - fa) / (fb - fa)));
  }
  return ks[ks.length - 1][1];
};

export const keys3 = (f: number, ks: [number, V3][], ease = easeInOutCubic): V3 => {
  if (f <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) {
    const [fa, va] = ks[i];
    const [fb, vb] = ks[i + 1];
    if (f <= fb) return mix3(va, vb, ease((f - fa) / (fb - fa)));
  }
  return ks[ks.length - 1][1];
};

export const trNum = (v: number, decimals = 0) =>
  v.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
