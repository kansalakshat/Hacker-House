"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  DownloadSimpleIcon,
  ImageSquareIcon,
  PlusIcon,
  SparkleIcon,
  WarningIcon,
  XLogoIcon,
} from "@phosphor-icons/react";
import {
  builderTitle,
  CROP0,
  EVENT,
  loadArt,
  readyFonts,
  renderBadge,
  renderId,
  setFonts,
  toPngBlob,
  type Art,
  type Crop,
  type Shot,
} from "@/lib/render";

/* three.js is ~150KB gzipped, so it only loads if someone opens the 3D view. */
const PassScene = dynamic(() => import("@/components/PassScene"), {
  ssr: false,
  loading: () => null,
});

/* ------------------------------------------------------------------ types */

type Shape = "portrait" | "landscape";
type Photo = { img: ImageBitmap; w: number; h: number };

const MAX_BYTES = 30 * 1024 * 1024;

/* Shown one at a time on the empty stage. The card behind it is a second WebGL
   context compiling its shaders, which takes a few seconds on a cold load, and
   a stage that never moves reads as broken rather than busy. */
const HINTS = [
  "jpg, png, webp, or an iPhone HEIC straight off the camera roll.",
  "Your photo never leaves this browser. Nothing to sign up for.",
  "Any shape, any crop. Faces land right on the first try.",
  "Every pass gets its own builder title. Reroll until one fits.",
  "Drag the preview to move the shot, drag the slider to zoom.",
];

/**
 * Put the PNG on the clipboard so it can be pasted into an X post as a real
 * attachment. ClipboardItem takes the promise rather than the resolved blob:
 * Safari only honours a write whose data was requested inside the gesture.
 */
async function copyPng(canvas: HTMLCanvasElement) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      return false;
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": toPngBlob(canvas) }),
    ]);
    return true;
  } catch {
    // Firefox refuses image writes, and any browser refuses an unfocused one.
    return false;
  }
}

/* ------------------------------------------------------------ photo intake */

/**
 * Decode any common photo. Native decode first, which covers jpg/png/webp
 * everywhere and HEIC on Apple devices, then fall back to the wasm HEIC
 * decoder only when that fails, so the usual path pays nothing for it.
 */
async function decode(file: File): Promise<Photo> {
  if (file.size > MAX_BYTES) {
    throw new Error("That file is over 30MB. Try a smaller photo.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      const { heicTo } = await import("heic-to/next");
      const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.94 });
      bitmap = await createImageBitmap(jpeg, { imageOrientation: "from-image" });
    } catch {
      throw new Error("That file could not be read as an image. Try a jpg or png.");
    }
  }

  // Cap the working size: the biggest output is 1536px, and phones choke on 48MP.
  const long = Math.max(bitmap.width, bitmap.height);
  if (long > 2400) {
    const scale = 2400 / long;
    const small = await createImageBitmap(bitmap, {
      resizeWidth: Math.round(bitmap.width * scale),
      resizeHeight: Math.round(bitmap.height * scale),
      resizeQuality: "high",
    });
    bitmap.close();
    bitmap = small;
  }

  return { img: bitmap, w: bitmap.width, h: bitmap.height };
}

/* --------------------------------------------------------------- the tool */

export function Studio() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const shareRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const uid = useId();

  const [shape, setShape] = useState<Shape>("portrait");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<Crop>(CROP0);
  const [name, setName] = useState("");
  const [stack, setStack] = useState("");
  const [salt, setSalt] = useState(0);

  const [art, setArt] = useState<Art>({});
  const [view3d, setView3d] = useState(true);
  // The card scene is a second WebGL context with its own models and shaders,
  // and it sits three screens below the fold. Mounting it on load made it
  // compile alongside the beach and hold the hero back; it waits until the
  // stage is nearly in view instead.
  const stage = useRef<HTMLDivElement>(null);
  const stageNear = useInView(stage, { once: true, margin: "600px" });
  // The flat canvas is the fallback, not a placeholder: it holds the frame
  // until the card's models and shaders are actually up. Hiding it the moment
  // the scene mounted left an empty box for the whole load.
  const [card3d, setCard3d] = useState(false);
  const onCardReady = useCallback(() => setCard3d(true), []);
  // Bumped on every repaint; the 3D scene polls it so the texture uploads only
  // when the artwork actually changed, without a React render per frame.
  const revision = useRef(0);
  const [fontsOk, setFontsOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Tagged rather than two states, so a success note and a failure can never
  // sit on screen contradicting each other.
  const [error, setError] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState(0);

  const title = useMemo(() => builderTitle(name, stack, salt), [name, stack, salt]);
  const hasArt = !!photo;
  const portraitBadge = shape === "portrait";

  /* --- one-time asset + font warmup --- */
  useEffect(() => {
    const root = getComputedStyle(document.documentElement);
    setFonts(
      root.getPropertyValue("--font-display").trim() || "Georgia, serif",
      root.getPropertyValue("--font-mono").trim() || "monospace",
    );
    readyFonts().then(() => setFontsOk(true)).catch(() => setFontsOk(true));
    loadArt().then(setArt).catch(() => setArt({}));
  }, []);

  /* --- cycle the empty-stage copy, only while the stage is empty --- */
  useEffect(() => {
    if (hasArt) return;
    const t = setInterval(() => setHint((n) => (n + 1) % HINTS.length), 3200);
    return () => clearInterval(t);
  }, [hasArt]);

  /* --- redraw whenever anything the artwork depends on changes --- */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const shot: Shot | null = photo
      ? { img: photo.img, w: photo.w, h: photo.h, crop }
      : null;
    const fields = { name, stack, title };

    if (portraitBadge) {
      renderBadge(view, shot, art, fields);
      // Off-screen landscape twin, so the X card is never a letterboxed portrait.
      if (shareRef.current) renderId(shareRef.current, shot, art, fields);
    } else {
      renderId(view, shot, art, fields);
    }
    revision.current += 1;
  }, [portraitBadge, photo, crop, name, stack, title, art, fontsOk]);

  /* --- intake --- */

  const takeFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy("Reading photo");
    try {
      const next = await decode(file);
      setPhoto((prev) => {
        prev?.img.close();
        return next;
      });
      setCrop(CROP0);
    } catch (e) {
      setError({
        ok: false,
        text: e instanceof Error ? e.message : "Could not read that photo.",
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      takeFile(e.dataTransfer.files?.[0]);
    },
    [takeFile],
  );

  /* --- drag to reposition --- */

  const drag = useRef<{ id: number; x: number; y: number; box: DOMRect } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photo) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      box: e.currentTarget.getBoundingClientRect(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.x) / d.box.width;
    const dy = (e.clientY - d.y) / d.box.height;
    d.x = e.clientX;
    d.y = e.clientY;
    setCrop((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  /* --- output --- */

  const fileStem = `hh-goa-2026-builder-pass${name.trim() ? "-" + slug(name) : ""}`;

  const download = async () => {
    const view = viewRef.current;
    if (!view) return;
    const blob = await toPngBlob(view);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileStem}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const caption = () => {
    const who = name.trim() || "Builder";
    return `${who} · ${title} · ${stack.trim() || "building things"}\n\nBuilder pass minted for Hacker House Goa 2026, 28-31 Oct. 🌴\nMake yours:\n${EVENT.tag}`;
  };

  /** The landscape art, so an X card is never a letterboxed portrait. */
  const shareCanvas = () => (portraitBadge ? shareRef.current : viewRef.current);

  /**
   * X web intents have no media parameter, so the PNG can never travel in the
   * URL. The clipboard carries it instead and one paste attaches it for real.
   * The share sheet would also carry the file, but it opens the OS app picker
   * rather than X, so this goes to X directly and pays for it with the paste.
   * Browsers that refuse image writes fall back to a hosted link card.
   */
  const shareToX = async () => {
    const text = caption();
    setError(null);

    // A real attachment should be the art as designed. Only the OG-card path
    // needs the landscape redraw, and only to avoid a letterboxed card.
    const art = viewRef.current;

    // Must happen before any window opens: clipboard writes are rejected the
    // moment this document loses focus.
    if (art && (await copyPng(art))) {
      setError({
        ok: true,
        text: "Pass copied. Paste it into the post to attach it: Ctrl+V, ⌘V, or long-press the box on mobile.",
      });
      // A plain x.com link, not the twitter:// scheme: universal links hand
      // straight to the app when it is installed and quietly stay on the web
      // when it is not, where a custom scheme would dead-end.
      window.open(
        `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
        "_blank",
        "noopener",
      );
      return;
    }

    // Opened synchronously so mobile Safari does not swallow it as a popup.
    const win = window.open("", "_blank");
    setBusy("Building your link");
    let link = "";
    let why = "";
    try {
      const canvas = shareCanvas();
      if (canvas) {
        const blob = await toPngBlob(canvas);
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "content-type": "image/png" },
          body: blob,
        });
        if (res.ok) {
          const { id } = (await res.json()) as { id: string };
          link = `${location.origin}/s/${id}`;
        } else {
          // The route explains itself (missing blob token, too large, not a
          // PNG). Swallowing that turned every failure into the same shrug.
          why = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Upload failed (${res.status}).`;
        }
      }
    } catch {
      why = "Could not reach the server.";
    } finally {
      setBusy(null);
    }

    const intent = new URL("https://x.com/intent/post");
    intent.searchParams.set("text", text);
    if (link) {
      intent.searchParams.set("url", link);
      setError({
        ok: true,
        text: "This browser cannot copy images, so the post carries a link preview of your pass instead.",
      });
    } else {
      // Nothing left that can carry the image, so hand them the file to attach
      // by hand rather than just apologising.
      download();
      setError({
        ok: false,
        text: `${why} The post has text only, so we downloaded the PNG for you to attach.`,
      });
    }
    if (win) win.location.href = intent.toString();
    else window.location.href = intent.toString();
  };

  /* ------------------------------------------------------------- markup */

  const stageAspect = portraitBadge ? "aspect-[1024/1536]" : "aspect-[1200/675]";
  const cardAspect = portraitBadge ? 1024 / 1536 : 1200 / 675;

  return (
    <section
      id="studio"
      aria-label="Graphic generator"
      className="mx-auto w-full max-w-6xl px-5 pt-10 pb-20 sm:px-8"
    >
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="display text-3xl text-yellow sm:text-4xl">Builder pass</h2>
        <p className="font-mono text-xs tracking-wide text-sea sm:text-sm">
          Lanyard badge or timeline card
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------ stage / dropzone */}
        <div className="lg:col-span-7">
          {/* The preview is a window in the house: a louvered shutter on each
              side, same as the ones drawn on the pass itself. */}
          <div
            className={`mx-auto flex items-stretch gap-2 sm:gap-3 ${
              portraitBadge ? "max-w-[500px]" : ""
            }`}
          >
            <span
              aria-hidden="true"
              className="slats w-7 shrink-0 rounded-lg border-4 border-outline bg-pink sm:w-11"
            />
            <div
              ref={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`relative min-w-0 flex-1 overflow-hidden rounded-2xl border-4 bg-deep transition-colors ${
                dragOver ? "border-pink" : "border-outline"
              }`}
            >
              <canvas
                ref={viewRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                role="img"
                aria-label="Builder pass preview"
                className={`block w-full ${stageAspect} ${hasArt ? "" : "opacity-30"} ${
                  photo ? "cursor-grab touch-none active:cursor-grabbing" : ""
                } ${view3d && card3d ? "invisible" : ""}`}
              />

              {/* Same pixels, on a card you can tilt. The flat canvas above stays
                  mounted and keeps painting, because it is what gets downloaded. */}
              {view3d && stageNear && (
                <div className="absolute inset-0">
                  <PassScene
                    sourceRef={viewRef}
                    revision={revision}
                    aspect={cardAspect}
                    still={!!reduce}
                    onReady={onCardReady}
                  />
                </div>
              )}

              <AnimatePresence>
                {!hasArt && (
                  <motion.label
                    key="drop"
                    initial={false}
                    exit={reduce ? {} : { opacity: 0, scale: 0.98 }}
                    htmlFor={`${uid}-file`}
                    className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-4 p-6 text-center has-[:focus-visible]:outline has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-yellow"
                  >
                    <motion.span
                      animate={reduce ? undefined : { y: [0, -7, 0] }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                      className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-outline bg-yellow text-ink"
                    >
                      <ImageSquareIcon size={30} weight="bold" aria-hidden="true" />
                    </motion.span>
                    <span className="display text-3xl text-yellow sm:text-4xl">
                      Drop a photo
                    </span>
                    {/* Kept narrow and on its own plate: it sits over a tilted
                        3D card, and full-width copy spilled past its edges. The
                        line cycles, because the card behind it takes a few
                        seconds to compile and a frozen stage reads as a stall. */}
                    <span className="flex h-16 w-60 items-center justify-center rounded-xl bg-ink/85 px-3 font-mono text-[11px] leading-relaxed text-cream">
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={hint}
                          initial={reduce ? false : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduce ? {} : { opacity: 0, y: -8 }}
                          transition={{ duration: 0.32 }}
                        >
                          {HINTS[hint]}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </motion.label>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {busy && (
                  <motion.div
                    key="busy"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-ink/85"
                  >
                    <p role="status" className="font-mono text-sm tracking-widest text-yellow uppercase">
                      {busy}…
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <span
              aria-hidden="true"
              className="slats w-7 shrink-0 rounded-lg border-4 border-outline bg-yellow sm:w-11"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Preview style" className="flex gap-1 rounded-full border-2 border-outline bg-cream p-1">
              {([[true, "3D"], [false, "Flat"]] as const).map(([on, text]) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={view3d === on}
                  onClick={() => setView3d(on)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 font-mono text-xs font-bold tracking-widest uppercase transition-colors ${
                    view3d === on
                      ? "bg-yellow text-ink shadow-[2px_2px_0_var(--color-outline)]"
                      : "text-ink hover:bg-sand"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {photo && (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-1 items-center gap-3">
                <span className="flex items-center gap-2 font-mono text-xs tracking-widest text-sea uppercase">
                  <ArrowsOutCardinalIcon size={16} weight="bold" aria-hidden="true" />
                  Zoom
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.02}
                  value={crop.zoom}
                  onChange={(e) => setCrop((c) => ({ ...c, zoom: +e.target.value }))}
                  className="h-2.5 flex-1 cursor-pointer appearance-none rounded-full border-2 border-outline bg-sand"
                />
              </label>
              <p className="font-mono text-xs text-sea">
                {view3d ? "Switch to Flat to drag the photo" : "Drag the preview to reposition"}
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ panel */}
        {/* The controls live in the house from the event artwork: terracotta
            roof on top, whitewashed wall behind the fields, sand at the foot. */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border-4 border-outline bg-cream">
            <div
              aria-hidden="true"
              className="tiles h-11 border-b-4 border-outline bg-pink"
            />

            <div className="flex flex-col gap-5 p-5">
              <input
                id={`${uid}-file`}
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  takeFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div className="flex items-stretch gap-2">
                <span
                  aria-hidden="true"
                  className="slats w-4 shrink-0 rounded border-2 border-outline bg-pink"
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-4 border-outline bg-yellow px-5 py-3 font-mono text-sm font-bold tracking-widest text-ink uppercase shadow-[3px_3px_0_var(--color-outline)] transition-transform hover:-translate-y-0.5"
                >
                  <PlusIcon size={16} weight="bold" aria-hidden="true" />
                  {photo ? "Change photo" : "Choose photo"}
                </button>
                <span
                  aria-hidden="true"
                  className="slats w-4 shrink-0 rounded border-2 border-outline bg-yellow"
                />
              </div>

              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-ink uppercase">
                  Pass shape
                </p>
                <div role="group" aria-label="Pass shape" className="mt-2 flex gap-2">
                  {([
                    ["portrait", "Lanyard badge"],
                    ["landscape", "Timeline card"],
                  ] as const).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={shape === id}
                      onClick={() => setShape(id)}
                      className={`flex-1 cursor-pointer rounded-lg border-2 border-outline px-3 py-2 font-mono text-xs font-bold tracking-wide text-ink uppercase transition-colors ${
                        shape === id
                          ? "bg-yellow shadow-[3px_3px_0_var(--color-outline)]"
                          : "bg-cream hover:bg-sand"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>

              <Field
                id={`${uid}-name`}
                label="Name"
                value={name}
                onChange={setName}
                placeholder="Akshat Kansal"
                max={22}
                autoComplete="name"
              />
              <Field
                id={`${uid}-stack`}
                label="Stack / role"
                value={stack}
                onChange={setStack}
                placeholder="MERN · :) · half a designer"
                max={28}
              />
              <div>
                <p className="font-mono text-xs font-bold tracking-widest text-ink uppercase">
                  Builder title
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {/* Sand fill, ink type: 4.9:1. Pink is 1.8:1 against both
                      green and cream, so it stays a keyline and a fill only. */}
                  <span className="flex-1 rounded-full border-2 border-outline bg-sand px-4 py-2 font-mono text-sm font-bold text-ink">
                    {title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSalt((s) => s + 1)}
                    aria-label="Generate a different builder title"
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-outline bg-cream text-ink transition-colors hover:bg-pink hover:text-cream"
                  >
                    <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="h-6 border-t-4 border-outline bg-sand"
            />
          </div>

          {error && (
            <p
              role="status"
              className={`flex items-start gap-2 rounded-xl border-2 bg-deep p-4 font-mono text-sm text-cream ${
                error.ok ? "border-yellow" : "border-pink"
              }`}
            >
              {error.ok ? (
                <SparkleIcon size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-yellow" />
              ) : (
                <WarningIcon size={18} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0 text-pink" />
              )}
              {error.text}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={download}
              disabled={!hasArt}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-4 border-outline bg-yellow px-5 py-4 font-mono text-sm font-bold tracking-widest text-ink uppercase shadow-[4px_4px_0_var(--color-outline)] transition-transform not-disabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-panel disabled:text-sea disabled:shadow-none"
            >
              <DownloadSimpleIcon size={18} weight="bold" aria-hidden="true" />
              Download PNG
            </button>
            <button
              type="button"
              onClick={shareToX}
              disabled={!hasArt || !!busy}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-4 border-outline bg-cream px-5 py-4 font-mono text-sm font-bold tracking-widest text-ink uppercase shadow-[4px_4px_0_var(--color-outline)] transition-transform not-disabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-panel disabled:text-sea disabled:shadow-none"
            >
              <XLogoIcon size={16} weight="bold" aria-hidden="true" />
              Share to X
            </button>
            <p className="flex items-start gap-2 font-mono text-xs leading-relaxed text-sea">
              <SparkleIcon size={14} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-pink" />
              Share to X opens a pre-written post with {EVENT.tag} and puts your
              pass on the clipboard, so one paste attaches it.
            </p>
          </div>
        </div>
      </div>

      {/* Off-screen landscape art so the X card is never letterboxed. */}
      <canvas
        ref={shareRef}
        className="pointer-events-none absolute -left-[9999px] h-px w-px"
        aria-hidden="true"
      />
    </section>
  );
}

/* ---------------------------------------------------------------- fields */

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  max,
  autoComplete = "off",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  autoComplete?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="font-mono text-xs font-bold tracking-widest text-ink uppercase">
        {label}
      </span>
      <input
        id={id}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border-2 border-outline bg-cream px-4 py-3 font-mono text-base text-ink placeholder:text-ink/55 focus:bg-sand"
      />
    </label>
  );
}

function slug(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}
