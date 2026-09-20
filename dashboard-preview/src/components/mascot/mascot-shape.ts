/**
 * Géométrie du moteur mascotte — portage fidèle de `src/bot/shape.ts` de
 * bloub (jeremy-prt/bloub, MIT) : profils radiaux aux mêmes angles (morph =
 * interpolation de rayons), enveloppe de cercles, union de disques,
 * superellipse exacte, contour Catmull-Rom, recalage au rayon réel.
 */

export const PROFILE_SAMPLES = 64;
export const RAYON = 100;
export const DEMI_VIEWBOX = 158;

export interface Point {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);
const COS = ANGLES.map(Math.cos);
const SIN = ANGLES.map(Math.sin);

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

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

/**
 * Superellipse : |x|^n + |y|^n = 1.
 * n = 2 donne une ellipse, n = 4.2 le squircle du personnalisateur.
 */
export function superellipseProfile(n: number): number[] {
  return ANGLES.map((_, i) => {
    const c = Math.abs(COS[i] ?? 0) ** n;
    const s = Math.abs(SIN[i] ?? 0) ** n;
    return (c + s) ** (-1 / n);
  });
}

/** Dé : superellipse 4.2, normalisée 1.15 (la diagonale peak, sinon paraît petit). */
export function squircleProfile(): number[] {
  return normalize(superellipseProfile(4.2), 1.15);
}

/** Enveloppe convexe de deux cercles (tangentes externes communes). */
export function hullOfCircles(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2v: number,
  steps = 96,
): Point[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1e-6;
  const base = Math.atan2(dy, dx);
  const spread = Math.acos(Math.max(-1, Math.min(1, (r1 - r2v) / dist)));
  const pts: Point[] = [];
  for (let i = 0; i <= steps / 2; i++) {
    const a = base + spread + ((TAU - 2 * spread) * i) / (steps / 2);
    pts.push({ x: x1 + Math.cos(a) * r1, y: y1 + Math.sin(a) * r1 });
  }
  for (let i = 0; i <= steps / 2; i++) {
    const a = base - spread + ((2 * spread) * i) / (steps / 2);
    pts.push({ x: x2 + Math.cos(a) * r2v, y: y2 + Math.sin(a) * r2v });
  }
  return pts;
}

/**
 * Polygone quelconque -> profil radial, par lancer de rayon depuis (cx, cy).
 * Calculé une seule fois au chargement, jamais dans la boucle de rendu.
 */
export function profileFromPolygon(poly: Point[], cx: number, cy: number): number[] {
  const radii = new Array<number>(PROFILE_SAMPLES).fill(0);
  const n = poly.length;
  for (let k = 0; k < PROFILE_SAMPLES; k++) {
    const dx = COS[k] ?? 0;
    const dy = SIN[k] ?? 0;
    let best = 0;
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const px = a.x - cx;
      const py = a.y - cy;
      const t = (px * ey - py * ex) / den;
      const u = (px * dy - py * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    radii[k] = best;
  }
  return radii;
}

/** Goutte : gros disque en bas, pointe effilée en haut. */
export function dropletProfile(): number[] {
  return normalize(profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0), 1.04);
}

/**
 * Profil radial de l'UNION de disques : r(theta) = la plus lointaine des
 * intersections rayon/cercle. Exact tant que l'origine est dans l'union —
 * c'est ce qui donne les bosses du nuage sans booléen de path.
 */
export function unionOfCirclesProfile(circles: Array<{ x: number; y: number; r: number }>): number[] {
  const out = new Array<number>(PROFILE_SAMPLES).fill(0);
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const dx = COS[i] ?? 0;
    const dy = SIN[i] ?? 0;
    let best = 0;
    for (const c of circles) {
      const b = dx * c.x + dy * c.y;
      const disc = b * b - (c.x * c.x + c.y * c.y - c.r * c.r);
      if (disc < 0) continue;
      const t = b + Math.sqrt(disc);
      if (t > best) best = t;
    }
    out[i] = best;
  }
  return out;
}

/** Nuage : union de bosses, large en bas, deux lobes en haut. */
export function cloudProfile(): number[] {
  return normalize(
    unionOfCirclesProfile([
      { x: -0.44, y: 0.2, r: 0.54 },
      { x: 0.46, y: 0.2, r: 0.5 },
      { x: 0.02, y: 0.3, r: 0.6 },
      { x: -0.24, y: -0.3, r: 0.48 },
      { x: 0.3, y: -0.24, r: 0.44 },
    ]),
    1.02,
  );
}

/**
 * Rayon du profil dans une direction quelconque (interpolation des deux
 * échantillons voisins). Sert à recaler ce qui est posé "sur" le corps
 * (yeux, pastille) quand la silhouette n'est plus un cercle.
 */
export function radiusAtAngle(radii: number[], angle: number): number {
  const n = radii.length;
  const t = ((((angle / TAU) % 1) + 1) % 1) * n;
  const i = Math.floor(t);
  return lerp(radii[i % n] ?? 1, radii[(i + 1) % n] ?? 1, t - i);
}

/** Projette un profil radial en points écran. */
export function toPoints(radii: number[], scale = RAYON, cx = 0, cy = 0): Point[] {
  return radii.map((r, i) => ({
    x: (Math.cos((i / radii.length) * TAU) * r + cx) * scale,
    y: (Math.sin((i / radii.length) * TAU) * r + cy) * scale,
  }));
}

/**
 * Polyligne fermée -> cubiques Catmull-Rom (tangentes centrées).
 * Avec 64 points, contour lisse au pixel près même affiché en 600 px.
 */
export function closedPath(pts: Point[]): string {
  const n = pts.length;
  if (n < 3) return "";
  const first = pts[0]!;
  let d = `M${r2(first.x)} ${r2(first.y)}`;
  const tension = 1 / 6;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += `C${r2(c1x)} ${r2(c1y)} ${r2(c2x)} ${r2(c2y)} ${r2(p2.x)} ${r2(p2.y)}`;
  }
  return `${d}Z`;
}

/** Profil radial -> chemin SVG lisse. */
export function profileToPath(radii: number[], scale = RAYON, cx = 0, cy = 0): string {
  return closedPath(toPoints(radii, scale, cx, cy));
}

/** Gélule (stade) centrée sur l'origine : la forme exacte des yeux. */
export function capsulePath(w: number, h: number): string {
  const hw = Math.max(w, 0.01) / 2;
  const hh = Math.max(h, 0.01) / 2;
  const r = Math.min(hw, hh);
  return (
    `M${r2(-hw)} ${r2(-hh + r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw + r)} ${r2(-hh)}` +
    `L${r2(hw - r)} ${r2(-hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw)} ${r2(-hh + r)}` +
    `L${r2(hw)} ${r2(hh - r)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(hw - r)} ${r2(hh)}` +
    `L${r2(-hw + r)} ${r2(hh)}` +
    `A${r2(r)} ${r2(r)} 0 0 1 ${r2(-hw)} ${r2(hh - r)}Z`
  );
}
