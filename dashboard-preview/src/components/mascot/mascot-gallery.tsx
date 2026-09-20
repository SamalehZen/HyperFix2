/**
 * Galerie de sélection des mascottes : vignettes FIGÉES (aucune boucle rAF),
 * survol = clin d'œil (une seule instance animée à la fois), clic = choix.
 * Bouton "reel" : joue les 14 animations sur toute l'équipe d'un coup
 * (le "clone" — gratuit car `sample(t)` est pur, aucune synchro).
 * Intégrée au popover Settings (`layout-controls.tsx`).
 */

"use client";

import * as React from "react";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Mascotte } from "@/lib/preferences/mascotte";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";
import { REEL_14 } from "@/components/mascot/mascot-cycles";
import type { MascotState } from "@/components/mascot/mascot-engine";
import { MASCOTS } from "@/components/mascot/mascot-skins";

export function MascotGallery() {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const [survolee, setSurvolee] = React.useState<string | null>(null);
  const [reel, setReel] = React.useState<number | null>(null);
  const [reducedMotion] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const enReel = reel !== null && !reducedMotion;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Choisir une mascotte">
        {MASCOTS.map((m) => {
          const active = mascotte === m.id;
          const hover = survolee === m.id;
          const animee = enReel || (hover && !active && !reducedMotion);
          const etat: MascotState = hover && !active && !enReel ? "wink" : "idle";
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={m.label}
              onClick={() => setPreference("mascotte", m.id as Mascotte)}
              onMouseEnter={() => setSurvolee(m.id)}
              onMouseLeave={() => setSurvolee((h) => (h === m.id ? null : h))}
              onFocus={() => setSurvolee(m.id)}
              onBlur={() => setSurvolee((h) => (h === m.id ? null : h))}
              className={cn(
                "grid place-items-center rounded-lg border p-1 transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-muted/50",
              )}
            >
              {animee ? (
                enReel ? (
                  <MascotAvatar
                    mascotId={m.id}
                    sequence={REEL_14}
                    playing
                    playKey={reel}
                    onSequenceEnd={() => setReel(null)}
                    size={40}
                    label={m.label}
                  />
                ) : (
                  <MascotAvatar mascotId={m.id} state={etat} size={40} label={m.label} />
                )
              ) : (
                <MascotAvatar mascotId={m.id} state="idle" size={40} frozen label={m.label} />
              )}
              <span className="mt-0.5 text-[10px] leading-none text-muted-foreground">{m.label}</span>
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full text-xs"
        onClick={() => setReel((r) => (r === null ? 0 : r + 1))}
        disabled={enReel || reducedMotion}
      >
        <Play />
        {enReel ? "Reel en cours…" : "Jouer les 14 animations sur l'équipe"}
      </Button>
    </div>
  );
}
