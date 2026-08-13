"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Credit } from "@/components/PassScene";
import {
  ArrowClockwiseIcon,
  ArrowsOutCardinalIcon,
  DownloadSimpleIcon,
  ImageSquareIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
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
  renderPfp,
  renderPfpShare,
  renderTeam,
  setFonts,
  toPngBlob,
  type Art,
  type Crop,
  type Member,
  type Shot,
} from "@/lib/render";

/* three.js is ~150KB gzipped, so it only loads if someone opens the 3D view. */
const PassScene = dynamic(() => import("@/components/PassScene"), {
  ssr: false,
  loading: () => null,
});

/* ------------------------------------------------------------------ types */

type Mode = "pfp" | "id" | "team";
type Shape = "portrait" | "landscape";
type Photo = { img: ImageBitmap; w: number; h: number; thumb: string };
type Slot = { photo: Photo | null; name: string };

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "pfp", label: "Frame", blurb: "Square profile frame for X" },
  { id: "id", label: "Builder pass", blurb: "Lanyard badge or timeline card" },
  { id: "team", label: "Team", blurb: "Up to four builders, one card" },
];

const MAX_BYTES = 30 * 1024 * 1024;
const TEAM_MAX = 4;

/* Whether this browser can hand the PNG straight to the X app. Probed once,
   client only, so the server render and the first client render agree. */
let sharesFiles: boolean | null = null;
const noSubscribe = () => () => {};
function canShareFiles() {
  if (sharesFiles === null) {
    try {
      sharesFiles = !!navigator.canShare?.({
        files: [new File([new Blob()], "probe.png", { type: "image/png" })],
      });
    } catch {
      sharesFiles = false;
    }
  }
  return sharesFiles;
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

  const canvas = document.createElement("canvas");
  const t = 160 / Math.max(bitmap.width, bitmap.height);
  canvas.width = Math.round(bitmap.width * t);
  canvas.height = Math.round(bitmap.height * t);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return {
    img: bitmap,
    w: bitmap.width,
    h: bitmap.height,
    thumb: canvas.toDataURL("image/jpeg", 0.7),
  };
}

/* --------------------------------------------------------------- the tool */

export function Studio() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const shareRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const teamFileRef = useRef<HTMLInputElement>(null);
  const teamTargetRef = useRef(0);
  const reduce = useReducedMotion();
  const uid = useId();

  const [mode, setMode] = useState<Mode>("pfp");
  const [shape, setShape] = useState<Shape>("portrait");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<Crop>(CROP0);
  const [team, setTeam] = useState<Slot[]>([{ photo: null, name: "" }]);
  const [name, setName] = useState("");
  const [stack, setStack] = useState("");
  const [teamName, setTeamName] = useState("");
  const [salt, setSalt] = useState(0);

  const [art, setArt] = useState<Art>({});
  const [view3d, setView3d] = useState(true);
  const [credits, setCredits] = useState<Credit[]>([]);
  // Bumped on every repaint; the 3D scene polls it so the texture uploads only
  // when the artwork actually changed, without a React render per frame.
  const revision = useRef(0);
  const [fontsOk, setFontsOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const title = useMemo(() => builderTitle(name, stack, salt), [name, stack, salt]);
  const hasArt = mode === "team" ? team.some((s) => s.photo) : !!photo;
  const portraitBadge = mode === "id" && shape === "portrait";

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

  /* --- redraw whenever anything the artwork depends on changes --- */
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const shot: Shot | null = photo
      ? { img: photo.img, w: photo.w, h: photo.h, crop }
      : null;
    const fields = { name, stack, title };

    if (mode === "pfp") {
      renderPfp(view, shot, art);
      if (shareRef.current) renderPfpShare(shareRef.current, shot, art, name);
    } else if (mode === "id") {
      if (shape === "portrait") {
        renderBadge(view, shot, art, fields);
        if (shareRef.current) renderId(shareRef.current, shot, art, fields);
      } else {
        renderId(view, shot, art, fields);
      }
    } else {
      const members: Member[] = team
        .filter((s) => s.photo)
        .map((s) => ({
          shot: { img: s.photo!.img, w: s.photo!.w, h: s.photo!.h, crop: CROP0 },
          name: s.name,
        }));
      renderTeam(view, members, art, teamName);
    }
    revision.current += 1;
  }, [mode, shape, photo, crop, name, stack, title, team, teamName, art, fontsOk]);

  /* --- intake --- */

  const takeFile = useCallback(async (file: File | undefined, slot = -1) => {
    if (!file) return;
    setError(null);
    setBusy("Reading photo");
    try {
      const next = await decode(file);
      if (slot < 0) {
        setPhoto((prev) => {
          prev?.img.close();
          return next;
        });
        setCrop(CROP0);
      } else {
        setTeam((prev) => {
          const copy = [...prev];
          copy[slot]?.photo?.img.close();
          copy[slot] = { ...copy[slot], photo: next };
          return copy;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that photo.");
    } finally {
      setBusy(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (mode === "team") {
        const slot = team.findIndex((s) => !s.photo);
        takeFile(file, slot < 0 ? 0 : slot);
      } else {
        takeFile(file);
      }
    },
    [mode, team, takeFile],
  );

  /* --- drag to reposition --- */

  const drag = useRef<{ id: number; x: number; y: number; box: DOMRect } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!photo || mode === "team") return;
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

  const fileStem =
    mode === "pfp" ? "hh-goa-2026-frame"
    : mode === "id" ? `hh-goa-2026-builder-pass${name.trim() ? "-" + slug(name) : ""}`
    : `hh-goa-2026-team${teamName.trim() ? "-" + slug(teamName) : ""}`;

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
    if (mode === "team") {
      return `${(teamName.trim() || "Our team").toUpperCase()} is building at Hacker House Goa 2026. 🌴\n\nOne upload each, one combined frame. Make yours:\n${EVENT.tag}`;
    }
    if (mode === "id") {
      const who = name.trim() || "Builder";
      return `${who} · ${title} · ${stack.trim() || "building things"}\n\nBuilder pass minted for Hacker House Goa 2026, 28-31 Oct. 🌴\nMake yours:\n${EVENT.tag}`;
    }
    return `I'm in. Hacker House Goa 2026, 28-31 Oct, Goa. 🌴\n\nMade my frame in one upload, no cropping. Make yours:\n${EVENT.tag}`;
  };

  /** The landscape art, so an X card is never a letterboxed portrait. */
  const shareCanvas = () =>
    mode === "pfp" || portraitBadge ? shareRef.current : viewRef.current;

  const shareToX = async () => {
    // Opened synchronously so mobile Safari does not swallow it as a popup.
    const win = window.open("", "_blank");
    const text = caption();
    setBusy("Building your link");
    setError(null);
    let link = "";
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
        }
      }
    } catch {
      // fall through: a text-only post still beats a dead button
    } finally {
      setBusy(null);
    }

    const intent = new URL("https://x.com/intent/post");
    intent.searchParams.set("text", text);
    if (link) intent.searchParams.set("url", link);
    else {
      setError("Could not host the preview image, so the post has text only. Download and attach it.");
    }
    if (win) win.location.href = intent.toString();
    else window.location.href = intent.toString();
  };

  const canNativeShare = useSyncExternalStore(noSubscribe, canShareFiles, () => false);

  const shareNative = async () => {
    const canvas = viewRef.current;
    if (!canvas) return;
    const blob = await toPngBlob(canvas);
    const file = new File([blob], `${fileStem}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: caption() });
    } catch {
      // user dismissed the sheet
    }
  };

  /* ------------------------------------------------------------- markup */

  const stageAspect =
    mode === "pfp" ? "aspect-square"
    : portraitBadge ? "aspect-[1024/1536]"
    : "aspect-[1200/675]";

  const cardAspect = mode === "pfp" ? 1 : portraitBadge ? 1024 / 1536 : 1200 / 675;

  return (
    <section
      id="studio"
      aria-label="Graphic generator"
      className="mx-auto w-full max-w-6xl px-5 pt-10 pb-20 sm:px-8"
    >
      {/* format switch */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Graphic format"
          className="flex gap-1 rounded-full border-2 border-line bg-deep p-1"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className="relative cursor-pointer rounded-full px-4 py-2 text-xs font-bold tracking-widest uppercase sm:px-6 sm:text-sm"
            >
              {mode === m.id && (
                <motion.span
                  layoutId="tabpill"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
                  className="absolute inset-0 rounded-full bg-yellow"
                />
              )}
              <span className={mode === m.id ? "relative text-ink" : "relative text-sea"}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
        <p className="hidden font-mono text-xs tracking-wide text-sea sm:block sm:text-sm">
          {MODES.find((m) => m.id === mode)!.blurb}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------ stage / dropzone */}
        <div className="lg:col-span-7">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative mx-auto overflow-hidden rounded-2xl border-4 bg-deep transition-colors ${
              dragOver ? "border-pink" : "border-line"
            } ${portraitBadge ? "max-w-[380px]" : ""}`}
          >
            <canvas
              ref={viewRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="img"
              aria-label={`${MODES.find((m) => m.id === mode)!.label} preview`}
              className={`block w-full ${stageAspect} ${hasArt ? "" : "opacity-30"} ${
                photo && mode !== "team" ? "cursor-grab touch-none active:cursor-grabbing" : ""
              } ${view3d ? "invisible" : ""}`}
            />

            {/* Same pixels, on a card you can tilt. The flat canvas above stays
                mounted and keeps painting, because it is what gets downloaded. */}
            {view3d && (
              <div className="absolute inset-0">
                <PassScene
                  sourceRef={viewRef}
                  revision={revision}
                  aspect={cardAspect}
                  still={!!reduce}
                  onScenery={setCredits}
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
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow text-ink">
                    <ImageSquareIcon size={30} weight="bold" aria-hidden="true" />
                  </span>
                  <span className="display text-3xl text-yellow sm:text-4xl">
                    Drop a photo
                  </span>
                  <span className="max-w-xs font-mono text-xs leading-relaxed text-cream sm:text-sm">
                    jpg, png, webp or iPhone HEIC. Any shape, any crop. Nothing
                    to sign up for.
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Preview style" className="flex gap-1 rounded-full border-2 border-line bg-deep p-1">
              {([[true, "3D"], [false, "Flat"]] as const).map(([on, text]) => (
                <button
                  key={text}
                  type="button"
                  aria-pressed={view3d === on}
                  onClick={() => setView3d(on)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 font-mono text-xs font-bold tracking-widest uppercase transition-colors ${
                    view3d === on ? "bg-yellow text-ink" : "text-sea hover:text-yellow"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            {credits.length > 0 && view3d && (
              <p className="font-mono text-[11px] text-sea">
                {credits.map((c, i) => (
                  <span key={c.key}>
                    {i > 0 && " · "}
                    <a href={c.url} className="underline underline-offset-2 hover:text-yellow">
                      {c.title}
                    </a>{" "}
                    by {c.author} ({c.license})
                  </span>
                ))}
              </p>
            )}
          </div>

          {photo && mode !== "team" && (
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
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-panel"
                />
              </label>
              <p className="font-mono text-xs text-sea">
                {view3d ? "Switch to Flat to drag the photo" : "Drag the preview to reposition"}
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------ panel */}
        <div className="flex flex-col gap-5 lg:col-span-5">
          {mode !== "team" && (
            <div className="rounded-2xl border-2 border-line bg-deep p-5">
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
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-mono text-sm font-bold tracking-widest text-ink uppercase transition-transform hover:scale-[1.02]"
              >
                <PlusIcon size={16} weight="bold" aria-hidden="true" />
                {photo ? "Change photo" : "Choose photo"}
              </button>
            </div>
          )}

          {mode === "id" && (
            <div className="flex flex-col gap-4 rounded-2xl border-2 border-line bg-deep p-5">
              <div>
                <p className="font-mono text-xs tracking-widest text-sea uppercase">
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
                      className={`flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 font-mono text-xs font-bold tracking-wide uppercase transition-colors ${
                        shape === id
                          ? "border-yellow bg-yellow text-ink"
                          : "border-line text-sea hover:border-yellow"
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
                placeholder="Asha Menon"
                max={22}
                autoComplete="name"
              />
              <Field
                id={`${uid}-stack`}
                label="Stack / role"
                value={stack}
                onChange={setStack}
                placeholder="Rust · zk · half a designer"
                max={28}
              />
              <div>
                <p className="font-mono text-xs tracking-widest text-sea uppercase">
                  Builder title
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex-1 rounded-full border-2 border-pink bg-ink px-4 py-2 font-mono text-sm font-bold text-pink">
                    {title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSalt((s) => s + 1)}
                    aria-label="Generate a different builder title"
                    className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-line text-sea transition-colors hover:border-yellow hover:text-yellow"
                  >
                    <ArrowClockwiseIcon size={16} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {mode === "team" && (
            <div className="flex flex-col gap-4 rounded-2xl border-2 border-line bg-deep p-5">
              <Field
                id={`${uid}-team`}
                label="Team name"
                value={teamName}
                onChange={setTeamName}
                placeholder="Sandbox Syndicate"
                max={20}
              />
              <input
                ref={teamFileRef}
                type="file"
                accept="image/*,.heic,.heif"
                className="sr-only"
                onChange={(e) => {
                  takeFile(e.target.files?.[0], teamTargetRef.current);
                  e.target.value = "";
                }}
              />
              <ul className="flex flex-col gap-3">
                {team.map((slot, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        teamTargetRef.current = i;
                        teamFileRef.current?.click();
                      }}
                      className="h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-line bg-panel"
                      aria-label={
                        slot.photo
                          ? `Change photo for builder ${i + 1}`
                          : `Add photo for builder ${i + 1}`
                      }
                    >
                      {slot.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={slot.photo.thumb}
                          alt=""
                          width={48}
                          height={48}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PlusIcon size={16} weight="bold" aria-hidden="true" className="mx-auto text-sea" />
                      )}
                    </button>
                    <input
                      value={slot.name}
                      maxLength={14}
                      placeholder={`Builder ${i + 1}`}
                      aria-label={`Name for builder ${i + 1}`}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) =>
                        setTeam((prev) =>
                          prev.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg border-2 border-line bg-panel px-3 py-2 font-mono text-sm text-cream placeholder:text-sea/70"
                    />
                    {team.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setTeam((prev) => {
                            prev[i].photo?.img.close();
                            return prev.filter((_, j) => j !== i);
                          })
                        }
                        aria-label={`Remove builder ${i + 1}`}
                        className="shrink-0 cursor-pointer p-2 text-sea transition-colors hover:text-pink"
                      >
                        <TrashIcon size={18} weight="bold" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {team.length < TEAM_MAX && (
                <button
                  type="button"
                  onClick={() => setTeam((prev) => [...prev, { photo: null, name: "" }])}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-dashed border-line px-4 py-2 font-mono text-xs font-bold tracking-widest text-sea uppercase transition-colors hover:border-yellow hover:text-yellow"
                >
                  <PlusIcon size={14} weight="bold" aria-hidden="true" />
                  Add builder
                </button>
              )}
            </div>
          )}

          {error && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-xl border-2 border-pink bg-deep p-4 font-mono text-sm text-cream"
            >
              <WarningIcon size={18} weight="bold" aria-hidden="true" className="mt-0.5 shrink-0 text-pink" />
              {error}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={download}
              disabled={!hasArt}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-full bg-yellow px-5 py-4 font-mono text-sm font-bold tracking-widest text-ink uppercase transition-transform not-disabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:bg-panel disabled:text-sea"
            >
              <DownloadSimpleIcon size={18} weight="bold" aria-hidden="true" />
              Download PNG
            </button>
            <button
              type="button"
              onClick={shareToX}
              disabled={!hasArt || !!busy}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-cream bg-cream px-5 py-4 font-mono text-sm font-bold tracking-widest text-ink uppercase transition-transform not-disabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:border-line disabled:bg-panel disabled:text-sea"
            >
              <XLogoIcon size={16} weight="bold" aria-hidden="true" />
              Share to X
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={shareNative}
                disabled={!hasArt}
                className="cursor-pointer rounded-full border-2 border-line px-5 py-3 font-mono text-xs font-bold tracking-widest text-sea uppercase hover:border-yellow hover:text-yellow disabled:border-line disabled:text-sea/50"
              >
                Share image directly
              </button>
            )}
            <p className="flex items-start gap-2 font-mono text-xs leading-relaxed text-sea">
              <SparkleIcon size={14} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-pink" />
              Share to X opens a pre-written post with {EVENT.tag}. The link
              preview carries this exact graphic.
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
      <span className="font-mono text-xs tracking-widest text-sea uppercase">
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
        className="mt-2 w-full rounded-lg border-2 border-line bg-panel px-4 py-3 font-mono text-base text-cream placeholder:text-sea/70 focus:border-yellow"
      />
    </label>
  );
}

function slug(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}
