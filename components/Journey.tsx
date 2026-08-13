"use client";

/**
 * The scroll experience: a pinned 3D beach whose camera is scrubbed by scroll
 * while copy waypoints hand over between each other. A still of the scene holds
 * the frame until the models are in; there is no loading screen in front of it.
 *
 * Scroll position is written straight into a ref that the r3f render loop
 * reads, so scrubbing never triggers a React render. Lenis smooths the wheel,
 * GSAP ScrollTrigger owns the pin and the scrub.
 */

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { EVENT } from "@/lib/render";

const BeachScene = dynamic(() => import("@/components/BeachScene"), {
  ssr: false,
  loading: () => null,
});

/** Reduced-motion as an external store: no setState-in-effect, no mismatch. */
const motionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
function subscribeMotion(cb: () => void) {
  const mq = motionQuery();
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const STOPS = [
  {
    eyebrow: "✦ Frame / Builder pass generator",
    title: "Put yourself in Goa.",
    body: "Upload one photo. Get an HH Goa 2026 frame or builder pass in seconds.",
  },
  {
    eyebrow: "✦ 28-31 October 2026",
    title: "Four days on the sand.",
    body: "247 builders, one beach, no fluff. This is the frame that says you were there.",
  },
  {
    eyebrow: "✦ One upload, no cropping",
    title: "Then post it.",
    body: "Download the PNG or fire it straight at X with the caption already written.",
  },
];

export function Journey() {
  const wrap = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const stopRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [done, setDone] = useState(false);
  // done = safe to mount the canvas. sceneReady = the models are actually on
  // screen, which is a good deal later and is what the still waits for.
  const [sceneReady, setSceneReady] = useState(false);
  const handleReady = useCallback(() => setSceneReady(true), []);

  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => motionQuery().matches,
    () => false,
  );

  /* --- hold the canvas back on real signals, not a fake timer --- */
  useEffect(() => {
    let n = 0;
    const total = 2;
    const step = () => setLoaded(Math.round((++n / total) * 100));

    // Pull the scene chunk now rather than when the canvas mounts. next/dynamic
    // only starts that download once `done` flips, which put a 250KB fetch in
    // front of the models the moment the still was ready to lift; warming it
    // here overlaps it with the wait instead. The models themselves are already
    // in flight from the preloads in the page head, so there is nothing to
    // probe for here: the canvas holds on the still's own floor and hands over
    // when BeachScene reports the models are actually up.
    import("@/components/BeachScene").catch(() => {});
    document.fonts.ready.then(step).catch(step);
    // A floor, so the still holds for a moment instead of flashing past.
    const floor = setTimeout(step, 900);
    return () => clearTimeout(floor);
  }, []);

  useEffect(() => {
    if (loaded >= 100) {
      const t = setTimeout(() => setDone(true), 450);
      return () => clearTimeout(t);
    }
  }, [loaded]);

  // If a model never resolves, the still would hold the page forever. Hand over
  // regardless after 12s: a half-dressed beach beats a frozen one.
  useEffect(() => {
    if (!done || sceneReady) return;
    const t = setTimeout(handleReady, 12000);
    return () => clearTimeout(t);
  }, [done, sceneReady, handleReady]);

  /* --- smooth scroll + pinned scrub --- */
  useEffect(() => {
    if (!done || reduced || !wrap.current) return;

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrap.current!,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          progress.current = self.progress;
        },
      });

      // Waypoint copy hands over across the pinned run.
      stopRefs.current.forEach((el, i) => {
        if (!el) return;
        const span = 1 / STOPS.length;
        gsap.set(el, { opacity: i === 0 ? 1 : 0, y: i === 0 ? 0 : 28 });
        ScrollTrigger.create({
          trigger: wrap.current!,
          start: `top+=${i * span * 100}% top`,
          end: `top+=${(i + 1) * span * 100}% top`,
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress;
            const inFade = Math.min(1, p / 0.25);
            const outFade = 1 - Math.max(0, (p - 0.75) / 0.25);
            const o = i === 0 ? outFade : Math.min(inFade, outFade);
            gsap.set(el, { opacity: o, y: (1 - o) * 28 });
          },
        });
      });
    }, wrap);

    return () => {
      cancelAnimationFrame(raf);
      lenis.off("scroll", onScroll);
      lenis.destroy();
      ctx.revert();
    };
  }, [done, reduced]);

  return (
    <>
      {/* pinned 3D beach + waypoint copy */}
      <div ref={wrap} className={reduced ? "relative" : "relative h-[320vh]"}>
        <div className="sticky top-0 h-[100dvh] overflow-hidden">
          <div className="absolute inset-0">
            {done && (
              <BeachScene
                progress={progress}
                still={reduced}
                onReady={handleReady}
              />
            )}
          </div>
          {/* The still sits OVER the canvas, not under it, and only lifts once the
              models are in. Underneath, the canvas paints its own sky the moment
              it mounts, which is the pale blue flash that used to show through. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-[url('/default.webp')] bg-cover bg-center transition-opacity duration-700 ${
              sceneReady ? "opacity-0" : "opacity-100"
            }`}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent from-86% to-ink"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_85%_at_0%_18%,rgba(3,8,10,0.78),rgba(3,8,10,0.30)_38%,transparent_68%)]"
          />

          {/* Everything written over the scene waits for the scene. The still
              carries its own wordmark and headline, so showing these on top of
              it would double every line. */}
          <div
            className={`transition-opacity duration-500 ${
              sceneReady ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:h-20 sm:px-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lockup.svg"
                alt="Hacker House Goa"
                width={68}
                height={60}
                className="h-11 w-auto sm:h-14"
              />
              <span className="font-mono text-[10px] tracking-[0.2em] text-sea uppercase sm:text-xs">
                {EVENT.place} · {EVENT.dates}
              </span>
            </div>

            <div className="relative mx-auto grid max-w-6xl px-5 sm:px-8">
              {STOPS.map((s, i) => (
                <div
                  key={s.title}
                  ref={(el) => {
                    stopRefs.current[i] = el;
                  }}
                  className={
                    reduced
                      ? "py-10"
                      : "col-start-1 row-start-1 pt-[14vh] will-change-[opacity,transform]"
                  }
                >
                  <p className="font-mono text-[11px] tracking-[0.25em] text-yellow [text-shadow:0_1px_8px_rgba(3,8,10,0.9)] uppercase sm:text-xs">
                    {s.eyebrow}
                  </p>
                  <h2 className="display stamp mt-4 max-w-4xl text-balance text-[clamp(3rem,11vw,7rem)] text-white">
                    {s.title}
                  </h2>
                  <p className="mt-5 max-w-md font-mono text-sm leading-relaxed text-white [text-shadow:0_1px_10px_rgba(3,8,10,0.9)] sm:text-base">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>

            {!reduced && (
              <p className="absolute bottom-7 left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-sea uppercase">
                Scroll
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
