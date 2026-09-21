/**
 * Moteur mascotte 14 états — portage de `src/bot/engine.ts` + `src/bot/states.ts`
 * de bloub (jeremy-prt/bloub, MIT) : `sample(t)` est une fonction PURE du temps.
 *
 * Adaptations : pas de système d'expressions (chaque état garde son visage
 * mesuré) ; la forme du personnalisateur remplace le corps sur les états
 * `baseBody` ; pas de table eyefit (recalage simple au rayon réel).
 */

import {
  arcRender,
  COMET_DOT,
  COMET_RIBBONS,
  DOT_PEAK,
  DOT_R,
  DOT_X,
  NOTIF_ANGLE,
  NOTIF_DIST,
  NOTIF_MARGIN,
  NOTIF_POP,
  NOTIF_R,
  RINGS,
  SWOOSH,
  particles,
  type ArcRender,
  type DotRender,
} from "./mascot-decor";
import { blinkScale, eyePoses, liveliness, REST_GAZE, type HeadGaze } from "./mascot-face";
import { clamp, easings, lerp, TAU } from "./mascot-math";
import { PROFILES } from "./mascot-profiles";
import {
  capsulePath,
  closedPath,
  hullOfCircles,
  profileFromPolygon,
  radiusAtAngle,
  RAYON,
  type Point,
} from "./mascot-shape";

export type MascotState =
  | "idle"
  | "thinking"
  | "wink"
  | "wide"
  | "alert"
  | "notify"
  | "exclaim"
  | "sleep"
  | "egg"
  | "hexagon"
  | "play"
  | "orbit"
  | "burst"
  | "comet";

export interface EyeCfg {
  w: number;
  h: number;
  open: number;
  tilt?: number;
}

export interface Pose {
  sil: Silhouette;
  offX: number;
  offY: number;
  gaze: HeadGaze;
  split: number;
  eyes: [EyeCfg, EyeCfg];
  eyeAlpha: number;
  bodyAlpha: number;
  dots: DotRender[];
  arcs: { id: string; seed: Parameters<typeof arcRender>[0]; t: number; opacity: number }[];
  notif: { x: number; y: number; r: number; notch: number } | null;
  dotsBehind: boolean;
}

export interface Silhouette {
  radii: number[];
  rot: number;
  cx: number;
  cy: number;
  sx: number;
  sy: number;
}

export interface RenderedEye {
  d: string;
  matrix: string;
  alpha: number;
}

export interface MascotFrame {
  bodyPath: string;
  bodyAlpha: number;
  eyes: RenderedEye[];
  dots: DotRender[];
  dotsBehind: boolean;
  arcs: ArcRender[];
  notif: { x: number; y: number; r: number } | null;
  notch: { x: number; y: number; r: number } | null;
}

export interface StateDef {
  id: MascotState;
  duration: number;
  morph: number;
  blinkIn: boolean;
  baseBody: boolean;
  pose: (t: number) => Pose;
}

/* ---------------------------------------------------------- géométrie */

function circle(radius: number, pose: Partial<Silhouette> = {}): Silhouette {
  return { radii: new Array(64).fill(radius), rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...pose };
}

const BAR_UPRIGHT_CY = -0.1875;
const BAR_UPRIGHT = profileFromPolygon(
  hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075),
  0,
  BAR_UPRIGHT_CY,
);
const BAR_ITALIC = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);

function polyPathPts(pts: Point[], scale = 1): string {
  if (pts.length < 3) return "";
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    d += `${i === 0 ? "M" : "L"}${Math.round(p.x * scale * 100) / 100} ${Math.round(p.y * scale * 100) / 100}`;
  }
  return `${d}Z`;
}

/** Point du "!" penché : goutte, bout rond côté barre, pointe effilée. */
const TEAR = polyPathPts(hullOfCircles(0, 0, 0.118, 0, 0.172, 0.012));

const TRI_ORBIT = 0.213;

function spinningTriangle(rot: number): Silhouette {
  return {
    radii: [...PROFILES.triangle],
    rot,
    cx: -TRI_ORBIT * Math.sin(rot),
    cy: TRI_ORBIT * Math.cos(rot),
    sx: 1,
    sy: 1,
  };
}

const pair = (w: number, h: number): [EyeCfg, EyeCfg] => [
  { w, h, open: 1 },
  { w, h, open: 1 },
];

function base(over: Partial<Pose> = {}): Pose {
  return {
    sil: circle(1),
    offX: 0,
    offY: 0,
    gaze: { ...REST_GAZE },
    split: 15.46,
    eyes: pair(0.186, 0.412),
    eyeAlpha: 1,
    bodyAlpha: 1,
    dots: [],
    arcs: [],
    notif: null,
    dotsBehind: false,
    ...over,
  };
}

function dotPulse(t: number, index: number): number {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
  return clamp(k * 2);
}

/* -------------------------------------------------------------- états */

export const STATES: StateDef[] = [
  { id: "idle", duration: 2.4, morph: 0.45, blinkIn: false, baseBody: true, pose: () => base() },

  {
    id: "thinking",
    duration: 2.6,
    morph: 0.4,
    baseBody: false,
    blinkIn: true,
    pose: (t) => {
      const mid = dotPulse(t, 1);
      const emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3));
      return base({
        sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1]! }),
        eyeAlpha: 0,
        dots: [0, 2].map((i) => {
          const k = dotPulse(t, i);
          return {
            x: DOT_X[i]! * emerge,
            y: 0,
            r: DOT_R * (1 + (DOT_PEAK - 1) * k),
            opacity: 0.55 + 0.45 * k,
          };
        }),
      });
    },
  },

  {
    id: "wink",
    duration: 1.6,
    morph: 0.3,
    blinkIn: true,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        eyes: [
          { w: 0.236, h: 0.464, open: 1 },
          { w: 0.447, h: 0.089, open: 1 },
        ],
      }),
  },

  {
    id: "wide",
    duration: 1.8,
    morph: 0.55,
    blinkIn: true,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 },
        split: 18.43,
        eyes: pair(0.356, 0.875),
      }),
  },

  {
    id: "alert",
    duration: 2.4,
    morph: 0.45,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      const p = clamp(t / 1.5);
      const travel = easings.easeInOutCubic(p) * 0.82 - 0.087;
      const back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0;
      const x = travel * (1 - back) + 0.1 * back;
      const buzz = Math.sin(t * 2.5 * TAU) * 0.005;
      const tilt = (17.7 * Math.PI) / 180;
      return base({
        sil: { radii: [...BAR_ITALIC], rot: tilt, cx: x, cy: -0.325 - buzz, sx: 1, sy: 1 },
        eyeAlpha: 0,
        dots: [
          {
            x: x - Math.sin(tilt) * 0.58,
            y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8,
            r: 0.118,
            d: TEAR,
            rot: (tilt * 180) / Math.PI,
            opacity: 1,
          },
        ],
      });
    },
  },

  {
    id: "notify",
    duration: 2.2,
    morph: 0.5,
    blinkIn: true,
    baseBody: true,
    pose: (t) => {
      const p = clamp(t / 0.45);
      const pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
      const r = NOTIF_R * (p < 1 ? pop : 1);
      const a = (NOTIF_ANGLE * Math.PI) / 180;
      return base({
        gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 },
        split: 18.89,
        eyes: pair(0.505, 0.498),
        notif: {
          x: Math.cos(a) * NOTIF_DIST,
          y: Math.sin(a) * NOTIF_DIST,
          r,
          notch: r + NOTIF_MARGIN,
        },
      });
    },
  },

  {
    id: "exclaim",
    duration: 2,
    morph: 0.45,
    baseBody: false,
    blinkIn: false,
    pose: () =>
      base({
        sil: { radii: [...BAR_UPRIGHT], rot: 0, cx: 0, cy: BAR_UPRIGHT_CY, sx: 1, sy: 1 },
        eyeAlpha: 0,
        dots: [{ x: -0.012, y: 0.526, r: 0.113, opacity: 1 }],
      }),
  },

  {
    id: "sleep",
    duration: 2.4,
    morph: 0.5,
    baseBody: false,
    blinkIn: false,
    pose: (t) =>
      base({
        sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }),
        eyeAlpha: 0,
      }),
  },

  {
    id: "egg",
    duration: 1.8,
    morph: 0.4,
    baseBody: false,
    blinkIn: true,
    pose: () =>
      base({
        sil: { radii: [...PROFILES.egg], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 },
        gaze: { yaw: 19.97, pitch: 26.01, roll: -17.1 },
        split: 11.07,
        eyes: pair(0.164, 0.385),
      }),
  },

  {
    id: "hexagon",
    duration: 1.6,
    morph: 0.4,
    baseBody: false,
    blinkIn: true,
    pose: () =>
      base({
        sil: { radii: [...PROFILES.hexagon], rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 },
        gaze: { yaw: 23.11, pitch: 24.42, roll: -13.3 },
        split: 13.37,
        eyes: pair(0.177, 0.411),
      }),
  },

  {
    id: "play",
    duration: 2,
    morph: 0.5,
    baseBody: false,
    blinkIn: true,
    pose: (t) => {
      const fade = clamp(t / 0.35) * clamp((2.2 - t) / 0.5);
      return base({
        sil: spinningTriangle(0),
        gaze: { yaw: 12, pitch: -8, roll: -6 },
        split: 15,
        eyes: pair(0.18, 0.34),
        arcs: SWOOSH.map((s, i) => ({
          id: `sw${i}`,
          seed: { ...s, cx: 0.45 - t * 0.42 },
          t,
          opacity: fade,
        })),
      });
    },
  },

  {
    id: "orbit",
    duration: 3.4,
    morph: 0.6,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      const ramp = easings.easeInOutCubic(clamp(t / 0.35));
      const rot = -TAU * 1.25 * t * ramp;
      const back = easings.easeInOutCubic(clamp((t - 1.6) / 0.9));
      const tri = spinningTriangle(rot);
      const ball = circle(1, { rot });
      const sil: Silhouette = {
        radii: tri.radii.map((r, i) => r + (ball.radii[i]! - r) * back),
        rot,
        cx: tri.cx * (1 - back),
        cy: tri.cy * (1 - back),
        sx: 1,
        sy: 1,
      };
      const fade = clamp(t / 0.8) * clamp((3.6 - t) / 0.9);
      return base({
        sil,
        gaze: {
          yaw: REST_GAZE.yaw + Math.sin(t * 6.5) * 65 * (1 - back),
          pitch: -4 + back * 32,
          roll: -13,
        },
        eyes: pair(0.18, 0.34 + back * 0.07),
        arcs: RINGS.map((s, i) => ({
          id: `rg${i}`,
          seed: s,
          t,
          opacity: fade * clamp((t - i * 0.13) / 0.3),
        })),
      });
    },
  },

  {
    id: "burst",
    duration: 2.6,
    morph: 0.4,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      const collapse = 1 - 0.834 * easings.easeOutQuint(clamp(t / 0.7));
      const regrow = easings.easeOutQuint(clamp((t - 1.7) / 0.7));
      return base({
        sil: circle(collapse + (1 - collapse) * regrow),
        eyeAlpha: clamp((t - 1.85) / 0.4),
        dots: particles(t, 1),
        dotsBehind: true,
      });
    },
  },

  {
    id: "comet",
    duration: 2.4,
    morph: 0.45,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      const collapse = 1 - (1 - COMET_DOT) * easings.easeOutQuint(clamp(t / 0.55));
      const regrow = easings.easeOutQuint(clamp((t - 1.85) / 0.6));
      const fade = clamp((t - 0.15) / 0.25) * clamp((1.95 - t) / 0.3);
      return base({
        sil: circle(collapse + (1 - collapse) * regrow, {
          cy: Math.sin(clamp(t / 1.7) * Math.PI) * 0.035,
        }),
        eyeAlpha: clamp((t - 2) / 0.35),
        arcs: COMET_RIBBONS.map((s, i) => ({ id: `cm${i}`, seed: s, t, opacity: fade })),
      });
    },
  },
];

export const STATE_BY_ID = new Map(STATES.map((s) => [s.id, s]));

/** Ordre du reel complet, calqué sur la vidéo de référence. */
export const SEQUENCE: MascotState[] = [
  "idle",
  "thinking",
  "wink",
  "wide",
  "alert",
  "notify",
  "exclaim",
  "sleep",
  "egg",
  "hexagon",
  "play",
  "orbit",
  "burst",
  "comet",
];

/* -------------------------------------------------------------- moteur */

interface Look {
  yaw: number;
  pitch: number;
  mix: number;
  wander: number;
}

const NO_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, wander: 1 };

function blendSil(a: Silhouette, b: Silhouette, t: number): Silhouette {
  return {
    radii: a.radii.map((r, i) => lerp(r, b.radii[i] ?? r, t)),
    rot: a.rot + (b.rot - a.rot) * t,
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
    sx: lerp(a.sx, b.sx, t),
    sy: lerp(a.sy, b.sy, t),
  };
}

function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t;
  return {
    sil: blendSil(a.sil, b.sil, t),
    offX: lerp(a.offX, b.offX, t),
    offY: lerp(a.offY, b.offY, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [
      {
        w: lerp(a.eyes[0].w, b.eyes[0].w, t),
        h: lerp(a.eyes[0].h, b.eyes[0].h, t),
        open: lerp(a.eyes[0].open, b.eyes[0].open, t),
        tilt: lerp(a.eyes[0].tilt ?? 0, b.eyes[0].tilt ?? 0, t),
      },
      {
        w: lerp(a.eyes[1].w, b.eyes[1].w, t),
        h: lerp(a.eyes[1].h, b.eyes[1].h, t),
        open: lerp(a.eyes[1].open, b.eyes[1].open, t),
        tilt: lerp(a.eyes[1].tilt ?? 0, b.eyes[1].tilt ?? 0, t),
      },
    ],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t })),
    ],
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
  };
}

function projectSil(sil: Silhouette, scale: number, offX: number, offY: number): Point[] {
  const n = sil.radii.length;
  const cr = Math.cos(sil.rot);
  const sr = Math.sin(sil.rot);
  return sil.radii.map((r, i) => {
    const a = (i / n) * TAU;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    return {
      x: ((x * cr - y * sr) * sil.sx + sil.cx + offX) * scale,
      y: ((x * sr + y * cr) * sil.sy + sil.cy + offY) * scale,
    };
  });
}

export class MascotEngine {
  readonly scale: number;
  private cur: MascotState = "idle";
  private prev: MascotState | null = null;
  private frozenPose: Pose | null = null;
  private tCur = 0;
  private tPrev = 0;
  private blinkAt = -10;
  private shape: number[] | null = null;
  private look: Look = NO_LOOK;
  private lookPrev: Look = NO_LOOK;
  private lookAt = -10;

  constructor(
    scale = RAYON,
    initial: MascotState = "idle",
    shape: number[] | null = null,
  ) {
    this.scale = scale;
    this.cur = initial;
    this.shape = shape;
  }

  get state(): MascotState {
    return this.cur;
  }

  private posed(def: StateDef, t: number): Pose {
    let pose = def.pose(t);
    if (def.baseBody && this.shape) {
      pose = { ...pose, sil: { ...pose.sil, radii: this.shape } };
    }
    return pose;
  }

  private origin(now: number): Pose | null {
    if (this.frozenPose) return this.frozenPose;
    if (!this.prev) return null;
    const prevDef = STATE_BY_ID.get(this.prev)!;
    return this.posed(prevDef, Math.max(0, now - this.tPrev));
  }

  private composite(now: number): Pose {
    const def = STATE_BY_ID.get(this.cur)!;
    const pose = this.posed(def, Math.max(0, now - this.tCur));
    const since = now - this.tCur;
    if (since >= def.morph) return pose;
    const origin = this.origin(now);
    if (!origin) return pose;
    return blendPose(origin, pose, easings.easeOutQuint(clamp(since / def.morph)));
  }

  setState(id: MascotState, now: number) {
    if (id === this.cur) return;
    const morph = STATE_BY_ID.get(this.cur)!.morph;
    const inFade = this.prev !== null && now - this.tCur < morph;
    this.frozenPose = inFade ? this.composite(now) : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now;
  }

  /**
   * Cible du regard normalisée (-1..1, Y écran vers le bas) ; null = repos.
   * Le pitch moteur est inversé (positif = haut) d'où le signe moins.
   */
  setLook(target: { x: number; y: number } | null, now: number) {
    const cur = this.lookAtTime(now);
    this.lookPrev = { ...cur };
    if (target && Number.isFinite(target.x + target.y)) {
      this.look = { yaw: target.x * 40, pitch: -target.y * 30, mix: 1, wander: 0 };
    } else {
      this.look = NO_LOOK;
    }
    this.lookAt = now;
  }

  private lookAtTime(now: number): Look {
    const k = easings.easeOutQuint(clamp((now - this.lookAt) / 0.24));
    return {
      yaw: lerp(this.lookPrev.yaw, this.look.yaw, k),
      pitch: lerp(this.lookPrev.pitch, this.look.pitch, k),
      mix: lerp(this.lookPrev.mix, this.look.mix, k),
      wander: lerp(this.lookPrev.wander, this.look.wander, k),
    };
  }

  sample(now: number): MascotFrame {
    const R = this.scale;
    let pose = this.composite(now);

    const alive = pose.eyeAlpha > 0.01;
    const look = this.lookAtTime(now);
    const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive });

    const gaze = {
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      roll: pose.gaze.roll + life.dRoll,
    };

    const forced = clamp((now - this.blinkAt) / 0.2);
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
    const lid = Math.min(life.lid, forcedLid);

    const offX = pose.offX + life.driftX;
    const offY = pose.offY + life.driftY;

    const sil: Silhouette = { ...pose.sil, sy: pose.sil.sy * life.breath };
    const bodyPath = closedPath(projectSil(sil, R, offX, offY));

    const bodyRadius = (x: number, y: number) =>
      radiusAtAngle(pose.sil.radii, Math.atan2(y, x));

    const eyes: RenderedEye[] = [];
    if (pose.eyeAlpha > 0.01) {
      const positions = eyePoses(gaze, R, pose.split);
      for (let i = 0; i < 2; i++) {
        const e = positions[i]!;
        if (e.depth <= 0.02) continue;
        const cfg = pose.eyes[i]!;
        const fit = bodyRadius(e.x, e.y);
        const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
        const cp = Math.cos(phi);
        const sp = Math.sin(phi);
        const ax = e.a * cp + e.c * sp;
        const ay = e.b * cp + e.d * sp;
        const cx2 = -e.a * sp + e.c * cp;
        const cy2 = -e.b * sp + e.d * cp;
        const k = blinkScale(Math.min(lid, cfg.open));
        eyes.push({
          d: capsulePath(cfg.w * R, cfg.h * R),
          matrix: `matrix(${ax.toFixed(4)},${(ay * k).toFixed(4)},${cx2.toFixed(4)},${(cy2 * k).toFixed(4)},${(e.x * fit + offX * R).toFixed(2)},${(e.y * fit + offY * R).toFixed(2)})`,
          alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
        });
      }
    }

    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && (p.d || p.r > 0.0005))
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }));

    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1;
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0;
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0;
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null;
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null;

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      arcs: pose.arcs
        .filter((a) => a.opacity > 0.01)
        .map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch,
    };
  }
}

export { RAYON };
