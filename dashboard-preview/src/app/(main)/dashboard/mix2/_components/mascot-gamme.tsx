/**
 * Mascotte du dashboard Mix2 : remplace l'initiale "S" devant "Bonjour Samaleh".
 * Résolution : `mascotte_rayon` explicite > équipe du rayon (mode auto) >
 * préférence globale `mascotte` ("auto" = rotation quotidienne, "none" = S).
 * Reçoit l'état du dashboard (thinking/notify/sleep/alert/idle).
 */

"use client";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";
import type { MascotState } from "@/components/mascot/mascot-engine";
import { EQUIPE_RAYON, MASCOTS } from "@/components/mascot/mascot-skins";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

function rotationQuotidienne(): string {
  const debut = new Date(new Date().getFullYear(), 0, 0).getTime();
  const jourAnnee = Math.floor((Date.now() - debut) / 86_400_000);
  return MASCOTS[jourAnnee % MASCOTS.length]!.id;
}

function resoudreGlobale(mascotte: string): string {
  if (mascotte === "auto") return rotationQuotidienne();
  return mascotte;
}

export function MascotGamme({ state = "idle", rayon = "frais-surgele" }: { state?: MascotState; rayon?: string }) {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);
  const mascotteRayon = usePreferencesStore((s) => s.values.mascotte_rayon);

  let id: string;
  if (mascotteRayon !== "auto" && mascotteRayon !== "none") {
    id = mascotteRayon;
  } else if (mascotteRayon === "auto") {
    id = EQUIPE_RAYON[rayon] ?? resoudreGlobale(mascotte);
  } else {
    id = resoudreGlobale(mascotte);
  }

  if (id === "none" || !MASCOTS.some((m) => m.id === id)) {
    return (
      <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
        S
      </div>
    );
  }

  return (
    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10">
      <MascotAvatar mascotId={id} state={state} size={44} interactive />
    </div>
  );
}
