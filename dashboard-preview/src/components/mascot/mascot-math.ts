/**
 * Maths du moteur mascotte — adaptation du principe `src/bot/math.ts` de
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
