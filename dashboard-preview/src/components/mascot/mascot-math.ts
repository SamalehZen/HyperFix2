/**
 * Maths du moteur mascotte — portage de `src/bot/math.ts` de
 * bloub (jeremy-prt/bloub, MIT) : easing exponentiels mesurés, pas de springs.
 */

export const TAU = Math.PI * 2;

export function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const easings = {
  easeOutQuint: (t: number) => 1 - (1 - t) ** 5,
  easeOutCubic: (t: number) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
};

/** Bruit 1D périodique : boucle sans couture sur `period`. */
export function loopNoise(t: number, period: number, seed = 0): number {
  const p = (t / period) * TAU;
  return (
    0.55 * Math.sin(p + seed) +
    0.3 * Math.sin(2 * p + seed * 1.7 + 1.1) +
    0.15 * Math.sin(3 * p + seed * 2.3 + 2.4)
  );
}

/** PRNG déterministe (mulberry32) : même séquence à chaque lecture. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Arrondi court : allège les chaînes de path générées à 60 fps. */
export const r2 = (v: number) => Math.round(v * 100) / 100;
