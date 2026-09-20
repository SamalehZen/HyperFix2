/**
 * Préférence "mascotte" du dashboard.
 * Valeurs consommées par `MascotGamme` (dashboard Mix2) et le sélecteur du
 * panneau Settings (`layout-controls.tsx`). "none" = initiale "S" historique.
 */
export const MASCOTTE_OPTIONS = [
  { label: "Aucune (initiale S)", value: "none" },
  { label: "Blob", value: "blob" },
  { label: "Galet", value: "galet" },
  { label: "Dé", value: "de" },
] as const;

export const MASCOTTE_VALUES = MASCOTTE_OPTIONS.map((o) => o.value);

export type Mascotte = (typeof MASCOTTE_VALUES)[number];
