/**
 * Moteur mascotte — adaptation du principe `src/bot/engine.ts` de bloub
 * (jeremy-prt/bloub, MIT) : `sample(t)` est une fonction PURE du temps.
 * Pas d'horloge interne, pas de Date.now() : la boucle rAF vit dans le
 * composant React, le moteur ne fait que calculer des images.
 *
 * États Phase 1 : idle (vie au repos : dérive du regard + clignements),
 * wink (clin d'œil), thinking (3 points pulsants), notify (pastille),
 * sleep (yeux fermés), alert (yeux écarquillés).
 */

import { clamp, easings, lerp, TAU } from "./mascot-math";
import { capsulePath, DEMI_VIEWBOX, profileToPath, RAYON } from "./mascot-shape";

export type MascotState = "idle" | "wink" | "thinking" | "notify" | "sleep" | "alert";

export interface MascotEye {
  d: string;
  matrix: string;
  alpha: number;
}

export interface MascotDot {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

export interface MascotFrame {
  bodyPath: string;
  eyes: MascotEye[];
  dots: MascotDot[];
  badge: { x: number; y: number; r: number } | null;
}

const EYE_X = 32;
const EYE_W = 24;
const EYE_H = 46;
const MORPH = 0.4;
const BLINK_DUR = 0.18;

interface EyePose {
  openL: number;
  openR: number;
  scale: number;
  alpha: number;
}

const POSES: Record<MascotState, EyePose> = {
  idle: { openL: 1, openR: 1, scale: 1, alpha: 1 },
  wink: { openL: 1, openR: 0.12, scale: 1, alpha: 1 },
  thinking: { openL: 1, openR: 1, scale: 1, alpha: 0 },
  notify: { openL: 1, openR: 1, scale: 1, alpha: 1 },
  sleep: { openL: 0.1, openR: 0.1, scale: 1, alpha: 1 },
  alert: { openL: 1, openR: 1, scale: 1.28, alpha: 1 },
};

function dotPulse(t: number, index: number): number {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
  return clamp(k * 2);
}

export class MascotEngine {
  private cur: MascotState = "idle";
  private prev: EyePose = POSES.idle;
  private tCur = 0;
  private blinkAt = -10;
  private nextBlink = 1.5;
  private look = { x: 0, y: 0 };
  private lookPrev = { x: 0, y: 0 };
  private lookAt = -10;

  constructor(private shapeRadii: number[] | null = null) {}

  setState(id: MascotState, now: number) {
    if (id === this.cur) return;
    this.prev = this.poseAtTime(now);
    this.cur = id;
    this.tCur = now;
    this.blinkAt = now;
  }

  /** Cible du regard normalisée (-1..1) ; null = retour au repos. */
  setLook(target: { x: number; y: number } | null, now: number) {
    const cur = this.lookAtTime(now);
    this.lookPrev = { ...cur };
    this.look = target ? { x: clamp(target.x, -1, 1), y: clamp(target.y, -1, 1) } : { x: 0, y: 0 };
    this.lookAt = now;
  }

  private poseAtTime(now: number): EyePose {
    const to = POSES[this.cur];
    const k = easings.easeOutQuint(clamp((now - this.tCur) / MORPH));
    return {
      openL: lerp(this.prev.openL, to.openL, k),
      openR: lerp(this.prev.openR, to.openR, k),
      scale: lerp(this.prev.scale, to.scale, k),
      alpha: lerp(this.prev.alpha, to.alpha, k),
    };
  }

  private lookAtTime(now: number): { x: number; y: number } {
    const k = easings.easeOutQuint(clamp((now - this.lookAt) / 0.24));
    return {
      x: lerp(this.lookPrev.x, this.look.x, k),
      y: lerp(this.lookPrev.y, this.look.y, k),
    };
  }

  sample(now: number): MascotFrame {
    const pose = this.poseAtTime(now);

    // --- clignement : calendrier + paupière asymétrique -----------------
    if (now >= this.nextBlink && pose.alpha > 0.5) {
      this.blinkAt = now;
      this.nextBlink = now + 2 + Math.random() * 2.5;
    }
    const bp = clamp((now - this.blinkAt) / BLINK_DUR);
    const lid = bp < 1 ? Math.abs(bp * 2 - 1) : 1;

    // --- vie au repos : dérive du regard (périodes premières = jamais périodique)
    const look = this.lookAtTime(now);
    const driftX = Math.sin(now * 0.53) * 5 + Math.sin(now * 0.91 + 1.7) * 3;
    const driftY = Math.sin(now * 0.47 + 0.6) * 3 + Math.sin(now * 0.79 + 2.2) * 2;
    const gx = driftX + look.x * 13;
    const gy = driftY + look.y * 9;

    // --- respiration du corps -------------------------------------------
    const breath = 1 + 0.008 * Math.sin(now * (TAU / 3));
    const radii = this.shapeRadii;
    const bodyPath = radii
      ? profileToPath(
          radii.map((r) => r * breath),
          RAYON,
        )
      : profileToPath(new Array(64).fill(breath), RAYON);

    // --- yeux : trous percés via <mask> (comme bloub), pas des formes posées
    const eyes: MascotEye[] = [];
    if (pose.alpha > 0.01) {
      const defs = [
        { x: -EYE_X, open: Math.min(lid, pose.openL) },
        { x: EYE_X, open: Math.min(lid, pose.openR) },
      ];
      for (const e of defs) {
        const k = Math.max(e.open, 0.06);
        eyes.push({
          d: capsulePath(EYE_W * pose.scale, EYE_H * pose.scale),
          matrix: `matrix(1,0,0,${k.toFixed(3)},${(e.x + gx).toFixed(2)},${gy.toFixed(2)})`,
          alpha: pose.alpha,
        });
      }
    }

    // --- thinking : 3 points pulsants ------------------------------------
    const dots: MascotDot[] = [];
    if (this.cur === "thinking") {
      const k = easings.easeOutQuint(clamp((now - this.tCur) / MORPH));
      [-34, 0, 34].forEach((x, i) => {
        const p = dotPulse(now, i);
        dots.push({ x, y: 0, r: 11 * (1 + 0.45 * p), opacity: k * (0.45 + 0.55 * p) });
      });
    }

    // --- notify : pastille avec pop ---------------------------------------
    let badge: MascotFrame["badge"] = null;
    if (this.cur === "notify") {
      const p = clamp((now - this.tCur) / 0.45);
      const pop = 1 + 0.14 * Math.sin(p * Math.PI) * (1 - p * 0.35);
      const a = (-38 * Math.PI) / 180;
      badge = {
        x: Math.cos(a) * 108,
        y: Math.sin(a) * 108,
        r: 20 * (p < 1 ? pop : 1),
      };
    }

    return { bodyPath, eyes, dots, badge };
  }
}

export { DEMI_VIEWBOX, RAYON };
