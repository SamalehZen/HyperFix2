/**
 * Préférence "mascotte" du dashboard.
 * Valeurs consommées par `MascotGamme` (dashboard Mix2) et le sélecteur du
 * panneau Settings (`layout-controls.tsx`). "none" = initiale "S" historique.
 */
export const MASCOTTE_OPTIONS = [
  { label: "Aucune (initiale S)", value: "none" },
  { label: "Auto (rotation quotidienne)", value: "auto" },
  { label: "Blob", value: "blob" },
  { label: "Galet", value: "galet" },
  { label: "Dé", value: "de" },
  { label: "Goutte", value: "goutte" },
  { label: "Nuage", value: "nuage" },
] as const;

export const MASCOTTE_VALUES = MASCOTTE_OPTIONS.map((o) => o.value);

export type Mascotte = (typeof MASCOTTE_VALUES)[number];

/**
 * Mascotte par rayon ("équipe") : "auto" = Goutte pour frais-surgelé,
 * Galet pour épicerie-salée ; un id explicite force partout ; "none" = suit
 * la préférence globale `mascotte`.
 */
export const MASCOTTE_RAYON_OPTIONS = [
  { label: "Auto (équipe par rayon)", value: "auto" },
  { label: "Suit la mascotte globale", value: "none" },
  { label: "Blob", value: "blob" },
  { label: "Galet", value: "galet" },
  { label: "Dé", value: "de" },
  { label: "Goutte", value: "goutte" },
  { label: "Nuage", value: "nuage" },
] as const;

export const MASCOTTE_RAYON_VALUES = MASCOTTE_RAYON_OPTIONS.map((o) => o.value);

export type MascotteRayon = (typeof MASCOTTE_RAYON_VALUES)[number];
