/**
 * Galerie de sélection des mascottes : vignettes FIGÉES (aucune boucle rAF),
 * survol = clin d'œil (une seule instance animée à la fois), clic = choix.
 * Intégrée au popover Settings (`layout-controls.tsx`).
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Mascotte } from "@/lib/preferences/mascotte";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { MascotAvatar } from "@/components/mascot/mascot-avatar";
import { MASCOTS } from "@/components/mascot/mascot-skins";

export function MascotGallery() {
  const mascotte = usePreferencesStore((s) => s.values.mascotte);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const [survolee, setSurvolee] = React.useState<string | null>(null);

  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Choisir une mascotte">
      {MASCOTS.map((m) => {
        const active = mascotte === m.id;
        const hover = survolee === m.id;
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
            {hover && !active ? (
              <MascotAvatar mascotId={m.id} state="wink" size={40} label={m.label} />
            ) : (
              <MascotAvatar mascotId={m.id} state="idle" size={40} frozen label={m.label} />
            )}
            <span className="mt-0.5 text-[10px] leading-none text-muted-foreground">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
