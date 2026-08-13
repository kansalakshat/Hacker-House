"use client";

/**
 * The wait, as a poster being screen printed.
 *
 * The models take seconds to arrive, so the hold has to carry the time rather
 * than deny it. The illustration is masked down to a flat green field and gets
 * squeegeed upward as the models actually land: the beach prints first, the sun
 * crowns it last. Progress is the reveal, so there is nothing to read as stuck.
 *
 * Nothing here re-renders. A single rAF eases the printed height toward the
 * real figure and writes clip-path and text straight to the DOM, because this
 * runs while three is decoding meshes and linking shaders, and a React render
 * per loaded file would be competing for the frame that matters.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/** Print stages, not a spinner's lies. Each one is a real thing being done. */
const STAGES = [
  "Mixing the inks",
  "Printing the sand",
  "Pulling the palms",
  "Laying the water",
  "Registering the sun",
  "Curing the sheet",
];

export function Loader({
  pct,
  ready,
  onSkip,
  reduced,
}: {
  /** Live 0..100 from the scene's own loader. Read, never subscribed to. */
  pct: React.RefObject<number>;
  ready: boolean;
  onSkip: () => void;
  reduced: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const edge = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLParagraphElement>(null);
  const skip = useRef<HTMLButtonElement>(null);

  /* --- the print itself --- */
  useEffect(() => {
    const set = (p: number) => {
      // Reveal upward. inset() clips from the top, so the printed height is the
      // complement: 0% printed means clipped all the way down to the horizon.
      art.current?.style.setProperty("clip-path", `inset(${100 - p}% 0 0 0)`);
      if (edge.current) edge.current.style.bottom = `${p}%`;
      if (num.current) num.current.textContent = String(Math.round(p));
    };

    if (reduced) {
      // No easing loop: land on the real figure whenever it moves.
      const t = setInterval(() => set(Math.min(pct.current, 100)), 400);
      return () => clearInterval(t);
    }

    let shown = 0;
    let raf = 0;
    const tick = () => {
      // Hold just short of full until the scene says it is actually on screen.
      // Sitting at 100 through the shader link is exactly the frozen beat this
      // screen exists to remove.
      const target = Math.min(pct.current, ready ? 100 : 99);
      // Creep even at nothing loaded, so the squeegee always has some travel.
      const floor = Math.min(shown + 0.04, 12);
      shown += (Math.max(target, floor) - shown) * 0.08;
      set(shown);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct, ready, reduced]);

  /* --- stage copy --- */
  useEffect(() => {
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      const el = stage.current;
      if (!el) return;
      el.textContent = STAGES[i % STAGES.length];
      if (reduced) return;
      gsap.fromTo(
        el,
        { yPercent: 60, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.45, ease: "power3.out" },
      );
    }, 1700);
    return () => clearInterval(t);
  }, [reduced]);

  /* --- the sheet leans toward the pointer, and takes ink where you press --- */
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;

    // quickTo interpolates, so no rAF and no debounce of our own. Elastic keeps
    // the sheet feeling like paper under a hand rather than a slider.
    const artX = gsap.quickTo(art.current, "xPercent", { duration: 0.7, ease: "elastic.out(1,0.5)" });
    const artY = gsap.quickTo(art.current, "yPercent", { duration: 0.7, ease: "elastic.out(1,0.5)" });

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      artX(((e.clientX - r.left) / r.width - 0.5) * 2.2);
      artY(((e.clientY - r.top) / r.height - 0.5) * 1.4);
    };

    const press = (e: PointerEvent) => {
      const dot = document.createElement("span");
      dot.className =
        "pointer-events-none absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-pink";
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      el.appendChild(dot);
      gsap.to(dot, {
        scale: 9,
        opacity: 0,
        duration: 0.9,
        ease: "power2.out",
        onComplete: () => dot.remove(),
      });
    };

    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", press);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", press);
    };
  }, [reduced]);

  /* --- an out, for anyone who has waited long enough --- */
  useEffect(() => {
    const t = setTimeout(() => {
      const el = skip.current;
      if (!el) return;
      el.hidden = false;
      if (!reduced) gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5 });
    }, 6000);
    return () => clearTimeout(t);
  }, [reduced]);

  return (
    <div ref={root} className="absolute inset-0 overflow-hidden bg-ink">
      {/* The sheet before ink: brand green, with the name of the place sitting
          in it waiting to be covered by the picture of the place. */}
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <span className="display text-[22vw] leading-none text-cream/[0.07] select-none">
          Goa
        </span>
      </div>

      {/* Water lines drifting across the bare sheet, so it is never dead. */}
      <div aria-hidden="true" className="absolute inset-x-0 top-[38%] opacity-30">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            viewBox="0 0 240 12"
            preserveAspectRatio="none"
            className="h-3 w-[200%]"
            style={{
              animation: `swim ${16 + i * 5}s linear infinite`,
              animationDelay: `${i * -4}s`,
              marginTop: i * 34,
              opacity: 1 - i * 0.25,
            }}
          >
            <path
              d="M0 6 q 15 -5 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0 t 30 0"
              fill="none"
              stroke="var(--color-cream)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        ))}
      </div>

      {/* The print. Clipped to the height that has actually loaded. */}
      <div
        ref={art}
        aria-hidden="true"
        className="absolute inset-0 bg-[url('/default.webp')] bg-cover bg-center will-change-[clip-path]"
        style={{ clipPath: "inset(100% 0 0 0)", scale: "1.06" }}
      />

      {/* The squeegee: a hard yellow rule with the brand's offset shadow. */}
      <div
        ref={edge}
        aria-hidden="true"
        className="absolute inset-x-0 z-10 h-[3px] bg-yellow shadow-[0_3px_0_var(--color-pink)]"
        style={{ bottom: "0%" }}
      />

      {/* Floor for the type: the printed art is near-white along the bottom. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-2/5 bg-gradient-to-t from-ink via-ink/80 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-6 px-5 pb-8 sm:px-8 sm:pb-10">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-yellow uppercase sm:text-xs">
            Printing HH Goa 2026
          </p>
          <p className="display mt-2 flex items-baseline text-cream" aria-hidden="true">
            <span ref={num} className="text-[clamp(4.5rem,17vw,11rem)] leading-[0.8]">
              0
            </span>
            <span className="ml-2 text-[clamp(1.2rem,4vw,2.4rem)] text-yellow">%</span>
          </p>
          <p
            ref={stage}
            role="status"
            className="mt-3 font-mono text-sm text-sea sm:text-base"
          >
            {STAGES[0]}
          </p>
        </div>

        <button
          ref={skip}
          hidden
          type="button"
          onClick={onSkip}
          className="cursor-pointer rounded-full border-2 border-line px-5 py-3 font-mono text-[11px] tracking-[0.2em] text-sea uppercase transition-colors hover:border-yellow hover:text-yellow"
        >
          Skip the wait
        </button>
      </div>
    </div>
  );
}
