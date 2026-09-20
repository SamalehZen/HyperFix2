/**
 * Géométrie du moteur mascotte — principe repris de `src/bot/shape.ts` de
 * bloub (jeremy-prt/bloub, MIT) : toutes les silhouettes sont des profils
 * radiaux échantillonnés aux mêmes angles, donc toute transition = simple
 * interpolation de rayons, sans librairie de morphing.
 */

export const PROFILE_SAMPLES = 64;
export const RAYON = 100;
export const DEMI_VIEWBOX = 158;

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2);

function normalize(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii);
  if (peak <= 0) return radii;
  const k = max / peak;
  return radii.map((r) => r * k);
}

/** Cercle parfait. */
export function circleProfile(): number[] {
  return new Array(PROFILE_SAMPLES).fill(1);
}

/** Galet : cercle déformé par deux harmoniques basses, irrégulier mais lisse. */
export function pebbleProfile(): number[] {
  return normalize(
    ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
    1.02,
  );
}

/** Dé (squircle) : superellipse d'exposant 4.2, un sommet adouci vers le haut. */
export function squircleProfile(): number[] {
  const n = 4.2;
  const e = 2 / n;
  return normalize(
    ANGLES.map((a) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r = 1 / (Math.abs(c) ** e + Math.abs(s) ** e) ** (1 / e);
      return r;
    }),
    1.15,
  );
}

/** Goutte : large et ronde en bas, effilée en haut (y écran vers le bas). */
export function dropletProfile(): number[] {
  return normalize(
    ANGLES.map((a) => 1 + 0.3 * Math.sin(a) ** 3 - 0.08 * Math.cos(2 * a)),
    1.04,
  );
}

/** Nuage : union de bosses, large en bas, lobes en haut. */
export function cloudProfile(): number[] {
  return normalize(
    ANGLES.map((a) => 1 + 0.1 * Math.cos(3 * a + 1) + 0.06 * Math.cos(5 * a + 2)),
    1.02,
  );
}

/** Convertit un profil radial en chemin SVG polygonal (64 points = lisse à 48px). */
export function profileToPath(radii: number[], scale = RAYON, cx = 0, cy = 0): string {
  const pts = radii.map((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    return `${(cx + Math.cos(a) * r * scale).toFixed(2)},${(cy + Math.sin(a) * r * scale).toFixed(2)}`;
  });
  return `M${pts.join("L")}Z`;
}

/** Gélule verticale (œil) centrée sur l'origine. */
export function capsulePath(w: number, h: number): string {
  const r = Math.min(w, h) / 2;
  const hw = w / 2;
  const hh = h / 2;
  if (r >= hw) {
    // Gélule verticale : deux demi-cercles + flancs droits.
    return `M${-hw},${-hh + r}A${r},${r} 0 0 1 ${hw},${-hh + r}L${hw},${hh - r}A${r},${r} 0 0 1 ${-hw},${hh - r}Z`;
  }
  // Quasi-cercle aplati : ellipse.
  return `M${-hw},0A${hw},${hh} 0 1 0 ${hw},0A${hw},${hh} 0 1 0 ${-hw},0Z`;
}
