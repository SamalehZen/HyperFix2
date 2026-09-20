/**
 * Formes et catalogue des mascottes HyperFix.
 * Mécanisme inspiré de `src/bot/skins.ts` de bloub (jeremy-prt/bloub, MIT),
 * avec nos propres silhouettes et couleurs (pas le design x.ai).
 */

import { circleProfile, cloudProfile, dropletProfile, pebbleProfile, squircleProfile } from "./mascot-shape";

export const SHAPE_BY_ID = new Map<string, number[]>([
  ["cercle", circleProfile()],
  ["galet", pebbleProfile()],
  ["squircle", squircleProfile()],
  ["goutte", dropletProfile()],
  ["nuage", cloudProfile()],
]);

export interface MascotDef {
  id: string;
  label: string;
  shape: string;
  /** Classe Tailwind LITTÉRALE (jamais construite dynamiquement). */
  bodyClass: string;
}

export const MASCOTS: MascotDef[] = [
  { id: "blob", label: "Blob", shape: "cercle", bodyClass: "fill-primary" },
  { id: "galet", label: "Galet", shape: "galet", bodyClass: "fill-chart-4" },
  { id: "de", label: "Dé", shape: "squircle", bodyClass: "fill-chart-1" },
  { id: "goutte", label: "Goutte", shape: "goutte", bodyClass: "fill-[#f08a24]" },
  { id: "nuage", label: "Nuage", shape: "nuage", bodyClass: "fill-chart-3" },
];

export const MASCOT_BY_ID = new Map(MASCOTS.map((m) => [m.id, m]));

export const DEFAULT_MASCOT = "blob";
