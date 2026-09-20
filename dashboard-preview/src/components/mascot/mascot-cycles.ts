/**
 * Montages (séquences) de la mascotte — principe `src/bot/cycles.ts` de bloub
 * (jeremy-prt/bloub, MIT) : un montage TIENT ou COUPE, il ne scale jamais le
 * temps (un facteur de vitesse casserait toutes les durées mesurées d'un coup).
 * Ici chaque bloc tient ses 2 s pleines ; orbit/burst/comet sont coupés
 * (reliquat absorbé par le fondu suivant, comme dans la référence).
 */

import type { SequenceBlock } from "./mascot-avatar";
import type { MascotState } from "./mascot-engine";

export const REEL_LABELS: Record<MascotState, string> = {
  idle: "Repos",
  thinking: "Réflexion",
  wink: "Clin d'œil",
  wide: "Yeux écarquillés",
  alert: "Alerte",
  notify: "Notification",
  exclaim: "Exclamation",
  sleep: "Veille",
  egg: "Œuf",
  hexagon: "Hexagone",
  play: "Lecture",
  orbit: "Orbite",
  burst: "Éclatement",
  comet: "Comète",
};

/** Reel complet : les 14 animations, 2 s chacune, retour à idle. */
export const REEL_14: SequenceBlock[] = [
  { state: "idle", duration: 2 },
  { state: "thinking", duration: 2 },
  { state: "wink", duration: 2 },
  { state: "wide", duration: 2 },
  { state: "alert", duration: 2 },
  { state: "notify", duration: 2 },
  { state: "exclaim", duration: 2 },
  { state: "sleep", duration: 2 },
  { state: "egg", duration: 2 },
  { state: "hexagon", duration: 2 },
  { state: "play", duration: 2 },
  { state: "orbit", duration: 2 },
  { state: "burst", duration: 2 },
  { state: "comet", duration: 2 },
];

export const REEL_14_MS = REEL_14.reduce((s, b) => s + b.duration, 0) * 1000;
