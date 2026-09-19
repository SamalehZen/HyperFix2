"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/* ── the wheel · a draggable instrument ring ────────────────
   60 ticks over a 300° sweep with a 60° gap at the bottom.
   The value is a spring, not a transition, so it overshoots
   and settles. Active ticks carry a slow travelling wave
   whose amplitude scales with the reading. Drag the ring. */

const N = 60;
const START = 120;   // degrees, bottom left
const SWEEP = 300;   // degrees, clockwise to bottom right
const CX = 100;
const CY = 100;
const R = 52;        // inner radius of the tick band

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/* ── FOUR BANDS, AND THE COLOUR LIVES IN CSS ───────────────
   It was three, and their hexes were written here: amber under
   25, blue over 80, a green between. Two things were wrong
   with that and one thing was missing.

   Wrong first: a hard hex cannot answer the theme. Every other
   signal colour on this bench is a token that swaps with the
   ramp, and these three stayed put — the green in particular
   was #16a34a, a text green, where the balance chart had
   already worked out that a THIN STROKE needs a brighter one
   to read as the same colour. These ticks are 2px.

   So this returns a NAME and the stylesheet holds the values,
   which is how the wheel gets both a light and a dark palette
   and how its green can be the chart's green without either
   file naming a number the other has to match.

   And the thing missing: red. "Critical" was amber, which is
   the colour of a warning rather than of a problem — there was
   nothing left to say when it got worse. So the bottom splits:
   under 12 is red and means it, 12 to 25 is the amber warning
   it always was.

   The labels stay even though nothing renders them. They are
   what the four numbers MEAN, and a band called "low" reads
   better at the call site than `v < 25`. */
function stateFor(v: number) {
  if (v < 12) return { label: "Critical", key: "crit" };
  if (v < 25) return { label: "Low", key: "low" };
  if (v > 80) return { label: "High", key: "high" };
  return { label: "Normal", key: "ok" };
}

/* ── inlined from ./Gooey ──────────────────────── */
/* ══ Gooey ════════════════════════════════════════════════
   What is left of the two library-surfaced components that
   used to live here: the measurement every liquid-gooey group
   on the bench needs. Liquid tabs and the Plus menu are gone;
   this is the part of them that turned out to be the reusable
   half, and Balance, the Selection list, the Humidity wheel
   and the Sleep dial all still call it.

   ── what the library actually does ──────────────────────
   The usual gooey effect runs blur + alpha-contrast over your
   real UI, which is why it is normally confined to decorative
   circles: text goes soft, images smear, and the contrast step
   eats shadows. liquid-gooey splits it in two. An SVG layer
   carries a silhouette of your elements and takes the whole
   filter; your actual DOM rides crisp on top of it, untouched.
   Same liquid, none of the tax — and it is the same discipline
   our own filter needs, since text under an alpha threshold
   loses its edges and then itself.

   ── the two patterns, which are not interchangeable ─────
   MORPH gives the library the position: pass x/y and it
   animates the element and the liquid together, so pieces that
   separate stay bridged until the goo can no longer hold them.
   The split IS the effect.

   MOVE gives the position to you: move the element however you
   like and the surface trails it as liquid rubber with a
   droplet tail. A filter has no memory of motion — a shape
   that crossed two pixels and one that crossed the whole track
   arrive identical — and this is the part that fixes that. */

/* ── the zoom correction, applied to someone else's SVG ──────
   liquid-gooey measures its items with getBoundingClientRect
   and draws them as SVG user units. Those are the same number
   only while no ancestor is scaled — and on this bench every
   component sits inside a scaled card, so the transform lands
   twice and the silhouette drifts from its element in
   proportion to both the scale and the distance from the
   origin. Measured: 0.1px at scale 1, 22px at 1.09, 124px at
   1.4.

   Everything the library computes is in screen px, so scaling
   its layer by 1/k converts the whole coordinate space back to
   layout px in one move, and the card's own transform then
   renders it correctly. Same k = rect.width / offsetWidth the
   rest of the bench uses.

   MOVE ONLY. Morph positions its items with a CSS transform on
   a real wrapper, in layout px, which scales correctly on its
   own — apply this there and you over-correct: the silhouette
   comes out 1/k the size of its button, so the blob is smaller
   than the element and every icon looks off-centre inside it.
   Measured on the plus menu: button 58px, blob 46px, and up to
   10px of offset. Without it, 58 and 58, dead on. */
function useGooScale() {
  const box = useRef<HTMLDivElement | null>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const next = (r.width / (el.offsetWidth || r.width)) || 1;
      setK((was) => (Math.abs(was - next) < 0.001 ? was : next));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    /* the card also rescales when the overlay opens, which is a
       transform change and not a resize */
    const t = window.setInterval(read, 500);
    return () => { ro.disconnect(); window.clearInterval(t); };
  }, []);
  return { box, k };
}

/* ── LOCAL ADDITIONS (dashboard integration, not Bencho) ────
   `value` makes the wheel a controlled display: the spring
   chases it (which also gives a free settle-in on mount).
   Dragging STAYS live in controlled mode: the pointer drives
   the target up to 100, and on release (or blur) the spring
   pulls back to `value` — touch it, it answers, let go, it
   returns to the data. Leave `value` undefined and the wheel
   stays the original draggable instrument that keeps its last
   position. `label` names the slider for assistive tech;
   `size` scales the 250px dial to its card. */
export default function Wheel({
  /* how finely the band is cut. Few and it reads as a scale,
     many and it reads as a surface. */
  ticks = N,
  /* how much of the circle the band covers, the rest being the
     gap at the bottom */
  sweep = SWEEP,
  /* the travelling wave the lit ticks carry. At 0 the ring is
     a static gauge; this is the one number that decides
     whether it looks alive. */
  wave: waveAmp = 2.6,
  /* controlled reading (0-100). Undefined = draggable instrument. */
  value,
  /* accessible name of the slider. */
  label = "Humidity",
  /* dial box in px (the source draws 250). */
  size = 250,
}: {
  ticks?: number;
  sweep?: number;
  wave?: number;
  value?: number;
  label?: string;
  size?: number;
}) {
  const controlled = value !== undefined;
  const [target, setTarget] = useState(controlled ? clamp(value ?? 62, 0, 100) : 62);
  const [display, setDisplay] = useState(controlled ? clamp(value ?? 62, 0, 100) : 62);
  const [dragging, setDragging] = useState(false);
  /* the library measures in screen pixels and every card on
     this bench is drawn at a fraction — see Gooey.tsx */
  const { box, k } = useGooScale();

  /* controlled mode: chase the incoming reading. */
  useEffect(() => {
    if (controlled) setTarget(clamp(value ?? 0, 0, 100));
  }, [controlled, value]);

  const cur = useRef(controlled ? clamp(value ?? 62, 0, 100) : 62);
  const vel = useRef(0);
  const wave = useRef(0);
  const raf = useRef<number | undefined>(undefined);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* dragging as a ref too: the rAF loop reads it without re-subscribing. */
  const dragRef = useRef(false);
  /* ── the ring sounds like what it is showing ──────────────
     A tiny sine whose pitch climbs with the reading, heard
     only while the pointer holds the ring (the return trip
     stays silent). Web Audio, created lazily on first touch
     so no gesture policy complains; ~0.05 gain, nothing more.
     Any failure → silent, never an exception in the UI. */
  const tone = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const startTone = () => {
    if (reduced) return;
    try {
      if (!tone.current) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AC();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 200;
        gain.gain.value = 0.0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        tone.current = { ctx, osc, gain };
      }
      void tone.current.ctx.resume?.();
      tone.current.gain.gain.setTargetAtTime(0.05, tone.current.ctx.currentTime, 0.02);
    } catch {
      tone.current = null;
    }
  };
  const stopTone = () => {
    const t = tone.current;
    if (t) t.gain.gain.setTargetAtTime(0.0, t.ctx.currentTime, 0.03);
  };

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* spring toward the target, plus a free running wave clock */
  useEffect(() => {
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(34, t - last) / 16.67;
      last = t;

      if (reduced) {
        cur.current = target;
      } else {
        /* 0.13 / 0.79, not 0.16 / 0.76. The return trip read
           as a snap; a touch less stiffness and a touch more
           damping makes the settle visible without turning the
           drag into a lag. */
        const k = 0.13;   // stiffness
        const d = 0.79;   // damping
        vel.current += (target - cur.current) * k * dt;
        vel.current *= Math.pow(d, dt);
        cur.current += vel.current * dt;
        if (Math.abs(target - cur.current) < 0.02 && Math.abs(vel.current) < 0.02) {
          cur.current = target;
          vel.current = 0;
        }
      }

      /* pitch follows the reading while held. */
      if (dragRef.current && tone.current) {
        const f = 200 + (clamp(cur.current, 0, 100) / 100) * 600;
        tone.current.osc.frequency.setTargetAtTime(f, tone.current.ctx.currentTime, 0.03);
      }

      wave.current += dt * 0.055;
      setDisplay(cur.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      try { tone.current?.osc.stop(); void tone.current?.ctx.close(); } catch { /* silent */ }
      tone.current = null;
    };
  }, [target, reduced]);

  /* pointer angle to value. In controlled mode the pointer drives a
     temporary target — release snaps back to `value` (see handlers). */
  const snapBack = () => {
    if (controlled) setTarget(clamp(value ?? 0, 0, 100));
  };
  const fromPointer = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const b = svg.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 200 - CX;
    const y = ((e.clientY - b.top) / b.height) * 200 - CY;
    let deg = (Math.atan2(y, x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    let rel = deg - START;
    if (rel < 0) rel += 360;
    if (rel > sweep) rel = rel < sweep + 30 ? sweep : 0;  // snap across the gap
    const next = Math.round((rel / sweep) * 100);
    /* the reading is the pitch: the ring sounds like what it
       is showing, and dragging it round is a slide */
    if (next !== target) setTarget(next);
  };

  const st = stateFor(display);
  const f = clamp(display, 0, 100) / 100;
  const amp = reduced ? 0 : 1 + (display / 100) * waveAmp;

  const band = Array.from({ length: ticks }, (_, i) => {
    const tf = i / (ticks - 1);
    const on = tf <= f + 0.001;
    const behind = f - tf;                         // >0 when the tick trails the head
    const comet = on && behind < 0.14 ? (1 - behind / 0.14) * 8 : 0;
    const undulate = on ? Math.sin(wave.current + i * 0.5) * amp : 0;
    /* ── 23 lit against 21 unlit, and it was 26 ──────────────
       Length is the coarse signal here and OPACITY is the fine
       one — the lit ticks run 0.42 to 1 depending on how far
       behind the head they are, which is the part carrying the
       reading. At 26 the length was saying it too, loudly, and
       the ring read as a solid block with a ragged edge rather
       than as a band of marks.

       24 and not 23, and the difference is the WAVE. The lit
       ticks undulate by about 2.6 either way at the default,
       so a base of 23 put the trough at 20.4 against an unlit
       21 — some lit ticks were SHORTER than unlit ones, and a
       band whose edge dips below the ground it sits on reads
       as noise rather than as a run. 24 keeps the trough at
       21.4, just clear of it. Measured both.

       The comet came down with it: at 8 the head still stands
       out from the band by more than twice the base
       difference, which is what makes it a head. */
    const len = (on ? 24 : 21) + comet + undulate;
    const a = rad(START + tf * sweep);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      key: i,
      x1: CX + cos * R,
      y1: CY + sin * R,
      x2: CX + cos * (R + len),
      y2: CY + sin * (R + len),
      on,
      opacity: on ? 0.42 + (1 - clamp(behind, 0, 1)) * 0.58 : 1,
    };
  });

  return (
    /* ── NO PANE ────────────────────────────────────────────
       Same move the sleep dial made, and for the same reason:
       a ring of ticks is already a shape, and putting a
       frosted rectangle round it only said "this is a
       component" to a page that has already said so with a
       card.

       What the pane WAS doing, quietly, was supplying
       contrast — see the tick opacity below. */
    <div className="hum" ref={box} data-state={st.key} style={{ "--k": k } as React.CSSProperties}>
      <div className="hum-dial" style={{ width: size, height: size }}>
      <svg
        ref={svgRef}
        className="hwheel"
        viewBox="0 0 200 200"
        style={{ width: size, height: size }}
        data-dragging={dragging}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={Math.round(display)}
        aria-valuemin={0}
        aria-valuemax={100}
        onPointerDown={(e) => {
          e.stopPropagation();
          setDragging(true);
          dragRef.current = true;
          startTone();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging && fromPointer(e)}
        onPointerUp={() => { setDragging(false); dragRef.current = false; stopTone(); snapBack(); }}
        onPointerCancel={() => { setDragging(false); dragRef.current = false; stopTone(); snapBack(); }}
        onBlur={() => snapBack()}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") setTarget((v) => clamp(v + 2, 0, 100));
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") setTarget((v) => clamp(v - 2, 0, 100));
        }}
      >
        {band.map((t) => (
          <line
            key={t.key}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            /* a style and not the `stroke` attribute: an
               attribute cannot hold a var(), and the band's
               colour is one — see stateFor and the .hum block
               in the stylesheet */
            style={{ stroke: t.on ? "var(--hum-lit)" : "currentColor" }}
            /* 0.24, not 0.13. The frosted pane used to sit a
               step lighter than the wall and an unlit tick had
               that to be dark against; straight onto the card's
               grey it measured about 1.2:1 and simply was not
               there. Same correction the sleep dial needed. */
            strokeOpacity={t.on ? t.opacity : 0.24}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div className="hwheel-readout">
        <span className="hum-figure">{Math.round(display)}</span>
        <span className="hum-unit">%</span>
      </div>
      </div>

    </div>
  );
}
