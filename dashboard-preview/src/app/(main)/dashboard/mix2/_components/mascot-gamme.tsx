/**
 * Mascotte du dashboard Mix2 : remplace l'initiale "S" devant "Bonjour Samaleh".
 * Lit la préférence `mascotte` ; "none" = initiale historique, "auto" = rotation
 * quotidienne stable (jour de l'année % catalogue).
 * Reçoit l'état du dashboard (thinking/notify/sleep/alert/idle).
 */

"use client";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";
import type { MascotState } from "@/components/mascot/mascot-engine";
import { MASCOTS } from "@/components/mascot/mascot-skins";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

function rotationQuotidienne(): string {
  const debut = new Date(new Date().getFullYear(), 0, 0).getTime();
  const jourAnnee = Math.floor((Date.now() - debut) / 86_400_000);
  return MASCOTS[jourAnnee % MASCOTS.length]!.id;
}

export function MascotGamme({ state = "idle" }: { state?: MascotState }) {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);
  const id = mascotte === "auto" ? rotationQuotidienne() : (mascotte ?? "none");

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
