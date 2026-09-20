/**
 * Renderer React/SVG de la mascotte — pendant de `BloubBot.vue`
 * (jeremy-prt/bloub, MIT) : le moteur est une fonction pure du temps,
 * ce composant ne possède que la boucle rAF et le DOM SVG.
 *
 * - `state` pilote l'état (idle/wink/thinking/notify/sleep/alert).
 * - `interactive` active le suivi du pointeur (souris uniquement).
 * - `prefers-reduced-motion` → une seule image figée, aucune boucle.
 * - Les yeux sont des trous dans un <mask>, pas des formes blanches.
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { MascotEngine, type MascotFrame, type MascotState } from "./mascot-engine";
import { DEMI_VIEWBOX } from "./mascot-shape";
import { MASCOT_BY_ID, SHAPE_BY_ID } from "./mascot-skins";

interface MascotAvatarProps {
  mascotId: string;
  state?: MascotState;
  size?: number;
  interactive?: boolean;
  /** Vignette figée : une seule image, aucune boucle rAF, aucun listener. */
  frozen?: boolean;
  className?: string;
  label?: string;
}

function renderFrame(engine: MascotEngine, t: number): MascotFrame {
  return engine.sample(t);
}

export function MascotAvatar({
  mascotId,
  state = "idle",
  size = 48,
  interactive = false,
  frozen = false,
  className,
  label = "Mascotte HyperFix",
}: MascotAvatarProps) {
  const def = MASCOT_BY_ID.get(mascotId) ?? MASCOT_BY_ID.get("blob")!;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const engineRef = React.useRef<MascotEngine | null>(null);
  const rawId = React.useId();
  const maskId = `mascot-mask-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [frame, setFrame] = React.useState<MascotFrame | null>(null);

  if (!engineRef.current) {
    engineRef.current = new MascotEngine(SHAPE_BY_ID.get(def.shape) ?? null);
  }
  const engine = engineRef.current;

  // Changement de mascotte : nouveau moteur, état conservé.
  React.useEffect(() => {
    engineRef.current = new MascotEngine(SHAPE_BY_ID.get(def.shape) ?? null);
    engineRef.current.setState(state, 0);
    setFrame(renderFrame(engineRef.current, 1.2));
  }, [def.shape, state]);

  // Changement d'état.
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    if (stateRef.current === state) return;
    stateRef.current = state;
  }, [state]);

  // Boucle de rendu (sauf reduced-motion ou frozen : une image figée).
  React.useEffect(() => {
    const eng = engineRef.current!;
    if (frozen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFrame(renderFrame(eng, 1.2));
      return;
    }
    let raf = 0;
    let start = 0;
    let last = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (!start) {
        start = ms;
        last = ms;
      }
      const dt = Math.min((ms - last) / 1000, 0.064);
      last = ms;
      void dt;
      eng.setState(stateRef.current, (ms - start) / 1000);
      setFrame({ ...renderFrame(eng, (ms - start) / 1000) });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frozen]);

  // Suivi du pointeur (souris uniquement, pas au tactile, jamais en frozen).
  React.useEffect(() => {
    if (!interactive || frozen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const eng = engineRef.current!;
    let t0 = performance.now() / 1000;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const nx = (e.clientX - (box.left + box.width / 2)) / Math.max(1, window.innerWidth / 2);
      const ny = (e.clientY - (box.top + box.height / 2)) / Math.max(1, window.innerHeight / 2);
      eng.setLook({ x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) }, performance.now() / 1000 - t0);
    };
    const onLeave = () => eng.setLook(null, performance.now() / 1000 - t0);
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [interactive, frozen]);

  if (!frame) return null;

  const VB = DEMI_VIEWBOX;

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={label}
      className={cn("shrink-0", className)}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
        </mask>
      </defs>
      {/* Fond opaque couleur page : ce que les yeux-trous laissent voir. */}
      <path d={frame.bodyPath} className="fill-background" />
      <g mask={`url(#${maskId})`}>
        <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} className={def.bodyClass} />
      </g>
      {frame.dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.opacity} className={def.bodyClass} />
      ))}
      {frame.badge && <circle cx={frame.badge.x} cy={frame.badge.y} r={frame.badge.r} className="fill-chart-1" />}
    </svg>
  );
}
