/**
 * Mascotte du dashboard Mix2 : remplace l'initiale "S" devant "Bonjour Samaleh".
 * Résolution : `mascotte_rayon` explicite > équipe du rayon (mode auto) >
 * préférence globale `mascotte` ("auto" = rotation quotidienne, "none" = S).
 * À l'ouverture : joue le reel des 14 animations une fois (~28 s), puis
 * retombe sur l'état du dashboard (thinking/notify/sleep/alert/idle).
 * Clic = rejouer le reel. Reduced-motion = état dashboard direct, sans reel.
 */

"use client";

import * as React from "react";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";
import { REEL_14 } from "@/components/mascot/mascot-cycles";
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
  const [reel, setReel] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? null
      : 0,
  );

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
      <div className="grid size-20 shrink-0 place-items-center rounded-full bg-primary text-3xl font-semibold text-primary-foreground">
        S
      </div>
    );
  }

  const enReel = reel !== null;

  return (
    <button
      type="button"
      title={enReel ? "Animation en cours…" : "Rejouer les 14 animations"}
      aria-label={enReel ? "Animation en cours" : "Rejouer les 14 animations"}
      onClick={() => setReel((r) => (r === null ? 0 : r + 1))}
      className="grid size-20 shrink-0 cursor-pointer place-items-center rounded-full bg-primary/10"
    >
      {enReel ? (
        <MascotAvatar
          mascotId={id}
          sequence={REEL_14}
          playing
          playKey={reel}
          onSequenceEnd={() => setReel(null)}
          size={72}
          interactive
        />
      ) : (
        <MascotAvatar mascotId={id} state={state} size={72} interactive playKey={id} />
      )}
    </button>
  );
}
