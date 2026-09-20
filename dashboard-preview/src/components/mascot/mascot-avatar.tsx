/**
 * Renderer React/SVG de la mascotte — pendant de `BloubBot.vue`
 * (jeremy-prt/bloub, MIT) : le moteur est une fonction pure du temps,
 * ce composant ne possède que la boucle rAF et le DOM SVG.
 *
 * - `state` : état direct (idle/wink/.../comet).
 * - `sequence` + `playing` : reel de blocs {state, duration} ; `onSequenceEnd`
 *   à la fin (ou `loop` pour boucler).
 * - `interactive` : suivi du pointeur (souris uniquement).
 * - `frozen` / `prefers-reduced-motion` : une seule image, aucune boucle.
 * - Yeux = trous dans un <mask> ; anneaux 3D triés (arrière occulté).
 */

"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { NOTIF_BLUE } from "./mascot-decor";
import { MascotEngine, type MascotFrame, type MascotState } from "./mascot-engine";
import { DEMI_VIEWBOX, RAYON } from "./mascot-shape";
import { MASCOT_BY_ID, SHAPE_BY_ID } from "./mascot-skins";

export interface SequenceBlock {
  state: MascotState;
  duration: number;
}

interface MascotAvatarProps {
  mascotId: string;
  state?: MascotState;
  sequence?: SequenceBlock[];
  playing?: boolean;
  loop?: boolean;
  onSequenceEnd?: () => void;
  size?: number;
  interactive?: boolean;
  /** Vignette figée : une seule image, aucune boucle rAF, aucun listener. */
  frozen?: boolean;
  /** Remet l'horloge à zéro (rejouer) quand cette valeur change. */
  playKey?: number | string;
  className?: string;
  label?: string;
}

function renderFrame(engine: MascotEngine, t: number): MascotFrame {
  return engine.sample(t);
}

function blockAt(blocks: SequenceBlock[], t: number): number {
  let acc = 0;
  for (let i = 0; i < blocks.length; i++) {
    acc += blocks[i]!.duration;
    if (t < acc) return i;
  }
  return blocks.length - 1;
}

export function MascotAvatar({
  mascotId,
  state = "idle",
  sequence,
  playing = false,
  loop = false,
  onSequenceEnd,
  size = 48,
  interactive = false,
  frozen = false,
  playKey = 0,
  className,
  label = "Mascotte HyperFix",
}: MascotAvatarProps) {
  const def = MASCOT_BY_ID.get(mascotId) ?? MASCOT_BY_ID.get("blob")!;
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const engineRef = React.useRef<MascotEngine | null>(null);
  const rawId = React.useId();
  const maskId = `mascot-mask-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const gradPrefix = `mascot-grad-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const [frame, setFrame] = React.useState<MascotFrame | null>(null);

  if (!engineRef.current) {
    engineRef.current = new MascotEngine(RAYON, state, SHAPE_BY_ID.get(def.shape) ?? null);
  }

  // Changement de mascotte : nouveau moteur (la boucle lit l'instance courante).
  React.useEffect(() => {
    engineRef.current = new MascotEngine(RAYON, state, SHAPE_BY_ID.get(def.shape) ?? null);
  }, [def.shape, state]);

  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const seqRef = React.useRef(sequence);
  seqRef.current = sequence;
  const playingRef = React.useRef(playing);
  playingRef.current = playing;
  const loopRef = React.useRef(loop);
  loopRef.current = loop;
  const endRef = React.useRef(onSequenceEnd);
  endRef.current = onSequenceEnd;

  const seqMode = !!sequence?.length;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Figé : vignette, séquence non jouée, ou mouvement réduit.
  const staticFrame = frozen || reduced || (seqMode && !playing);

  // Boucle de rendu (mode live : état continu ou séquence en cours).
  React.useEffect(() => {
    const eng = () => engineRef.current!;
    if (staticFrame) {
      const seq = seqRef.current;
      if (seq?.length && playingRef.current) {
        eng().setState(seq[0]!.state, 0);
        setFrame(renderFrame(eng(), 0.6));
      } else if (seq?.length) {
        eng().setState(seq[0]!.state, 0);
        setFrame(renderFrame(eng(), 0.6));
      } else {
        eng().setState(stateRef.current, 0);
        setFrame(renderFrame(eng(), 1.2));
      }
      return;
    }
    let raf = 0;
    let start = 0;
    let ended = false;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (!start) start = ms;
      const t = (ms - start) / 1000;
      const e = eng();
      const seq = seqRef.current;
      if (seq?.length && playingRef.current) {
        const total = seq.reduce((s, b) => s + b.duration, 0);
        if (t >= total && !loopRef.current) {
          if (!ended) {
            ended = true;
            e.setState(seq[seq.length - 1]!.state, total);
            setFrame({ ...renderFrame(e, total) });
            endRef.current?.();
          }
          return;
        }
        const tt = loopRef.current ? t % total : t;
        e.setState(seq[blockAt(seq, tt)]!.state, tt);
        setFrame({ ...renderFrame(e, tt) });
      } else {
        e.setState(stateRef.current, t);
        setFrame({ ...renderFrame(e, t) });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [staticFrame, playKey, seqMode]);

  // Suivi du pointeur (souris uniquement, pas au tactile, jamais en frozen).
  React.useEffect(() => {
    if (!interactive || frozen) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now() / 1000;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const nx = (e.clientX - (box.left + box.width / 2)) / Math.max(1, window.innerWidth / 2);
      const ny = (e.clientY - (box.top + box.height / 2)) / Math.max(1, window.innerHeight / 2);
      engineRef.current!.setLook(
        { x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) },
        performance.now() / 1000 - t0,
      );
    };
    const onLeave = () => engineRef.current!.setLook(null, performance.now() / 1000 - t0);
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
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />}
        </mask>
        {frame.arcs.map((arc, i) => (
          <linearGradient
            key={`${arc.id}-${i}`}
            id={`${gradPrefix}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, j) => (
              <stop key={j} offset={j / (arc.grad.stops.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* moitié arrière des orbites : dessinée avant le corps, donc occultée */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc, i) => (
          <path
            key={`b${arc.id}-${i}`}
            d={arc.back}
            stroke={`url(#${gradPrefix}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {/* particules Éclatement : passent derrière le noyau */}
      {frame.dotsBehind && (
        <g>
          {frame.dots.map((d, i) =>
            d.d ? (
              <path
                key={`pb${i}`}
                d={d.d}
                transform={`translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})`}
                opacity={d.opacity}
                className={def.bodyClass}
              />
            ) : (
              <circle key={`pb${i}`} cx={d.x} cy={d.y} r={d.r} opacity={d.opacity} className={def.bodyClass} />
            ),
          )}
        </g>
      )}

      <g opacity={frame.bodyAlpha}>
        {/* Fond opaque couleur page : ce que les yeux-trous laissent voir. */}
        <path d={frame.bodyPath} className="fill-background" />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} className={def.bodyClass} />
        </g>
      </g>

      {!frame.dotsBehind && (
        <g>
          {frame.dots.map((d, i) =>
            d.d ? (
              <path
                key={`pf${i}`}
                d={d.d}
                transform={`translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})`}
                opacity={d.opacity}
                className={def.bodyClass}
              />
            ) : (
              <circle key={`pf${i}`} cx={d.x} cy={d.y} r={d.r} opacity={d.opacity} className={def.bodyClass} />
            ),
          )}
        </g>
      )}

      {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill={NOTIF_BLUE} />}

      {/* moitié avant des orbites */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc, i) => (
          <path
            key={`f${arc.id}-${i}`}
            d={arc.front}
            stroke={`url(#${gradPrefix}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
