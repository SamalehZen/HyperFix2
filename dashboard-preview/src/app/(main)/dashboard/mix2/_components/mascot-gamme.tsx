/**
 * Mascotte du dashboard Mix2 : remplace l'initiale "S" devant "Bonjour Samaleh".
 * Lit la préférence `mascotte` ; "none" = initiale historique.
 * État "idle" + suivi du pointeur, figée si reduced-motion.
 */

"use client";

import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";

export function MascotGamme() {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);

  if (!mascotte || mascotte === "none") {
    return (
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
        S
      </div>
    );
  }

  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10">
      <MascotAvatar mascotId={mascotte} state="idle" size={44} interactive />
    </div>
  );
}
