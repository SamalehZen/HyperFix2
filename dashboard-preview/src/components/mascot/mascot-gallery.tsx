/**
 * Galerie de sélection des mascottes : vignettes FIGÉES (aucune boucle rAF),
 * survol = clin d'œil (une seule instance animée à la fois), clic = choix.
 * Bouton "séquence" : rejoue la même chorégraphie sur toute l'équipe d'un
 * coup (le "clone" — gratuit car `sample(t)` est pur, aucune synchro).
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
import type { MascotState } from "@/components/mascot/mascot-engine";
import { MASCOTS } from "@/components/mascot/mascot-skins";

const DEMO_SEQUENCE: MascotState[] = ["thinking", "notify", "idle"];
const DEMO_STEP_MS = 1500;

export function MascotGallery() {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const [survolee, setSurvolee] = React.useState<string | null>(null);
  const [demoStep, setDemoStep] = React.useState<number | null>(null);
  const [reducedMotion] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const jouerSequence = () => {
    if (demoStep !== null || reducedMotion) return;
    setDemoStep(0);
    DEMO_SEQUENCE.forEach((_, i) => {
      window.setTimeout(() => setDemoStep(i + 1 >= DEMO_SEQUENCE.length ? null : i + 1), DEMO_STEP_MS * (i + 1));
    });
  };

  const demoState: MascotState | null = demoStep !== null ? (DEMO_SEQUENCE[demoStep] ?? null) : null;

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Choisir une mascotte">
        {MASCOTS.map((m) => {
          const active = mascotte === m.id;
          const hover = survolee === m.id;
          const animee = demoState !== null || (hover && !active && !reducedMotion);
          const etat: MascotState = demoState ?? (hover && !active ? "wink" : "idle");
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
                <MascotAvatar mascotId={m.id} state={etat} size={40} label={m.label} />
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
        onClick={jouerSequence}
        disabled={demoStep !== null || reducedMotion}
      >
        <Play />
        {demoStep !== null ? "Séquence en cours…" : "Jouer la séquence sur l'équipe"}
      </Button>
    </div>
  );
}
