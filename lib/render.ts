/**
 * HH Goa 2026 graphic renderers.
 *
 * Everything is drawn on a 2D canvas so generation is synchronous and instant.
 * The look is HH Goa after dark: the event's own illustrations colour-graded to
 * night, the real HACKER / गोवा / HOUSE lockup, sun yellow and bougainvillea
 * pink as the only lit colours.
 */

/** Mirrors the @theme block in app/globals.css. Keep the two in step. */
export const C = {
  ink: "#0B6839",
  deep: "#08542d",
  panel: "#064424",
  line: "#2e8f5b",
  yellow: "#fee13c",
  pink: "#ff0080",
  cream: "#FFFBE8",
  sea: "#a9e5c8",
  sand: "#F0D799",    /* the ground the house sits on */
  outline: "#0A1A10", /* the keyline every shape in the artwork is drawn with */
} as const;

export const EVENT = {
  name: "HACKER HOUSE GOA",
  year: "2026",
  dates: "28-31 OCT 2026",
  datesShort: "28-31 OCT",
  place: "GOA, INDIA",
  motto: "LESS NOISE. MORE SIGNAL",
  tag: "#FrameInGoa",
  site: "hhgoa.com",
} as const;

/* ------------------------------------------------------------------ fonts */
/* next/font mangles family names, so the client hands us the resolved ones. */

let displayFamily = "Georgia, serif";
let monoFamily = "ui-monospace, monospace";

export function setFonts(display: string, mono: string) {
  displayFamily = display;
  monoFamily = mono;
}

const D = (size: number, weight = 900) => `${weight} ${size}px ${displayFamily}`;
const M = (size: number, weight = 400) => `${weight} ${size}px ${monoFamily}`;

/** Load the canvas fonts once. Without this the first render draws in Times. */
export async function readyFonts() {
  await Promise.all([
    document.fonts.load(D(100)),
    document.fonts.load(D(100, 700)),
    document.fonts.load(M(40)),
    document.fonts.load(M(40, 700)),
  ]);
  await document.fonts.ready;
}

/* ------------------------------------------------------------------- art */

export const ART_FILES = {
  /* The event's own house illustration: pink tile roof, louvered shutters,
     bougainvillea, palms, builders at the long table. Every colour on the pass
     is pulled out of it. */
  house: "/house.webp",
  lockup: "/lockup.svg",
  goa: "/goa.svg",
  qr: "/qr.png",
} as const;

export type ArtKey = keyof typeof ART_FILES;
export type Art = Partial<Record<ArtKey, HTMLImageElement>>;

/** Decode every brand asset up front so no render ever draws a half-built card. */
export async function loadArt(): Promise<Art> {
  const entries = await Promise.all(
    (Object.keys(ART_FILES) as ArtKey[]).map(async (key) => {
      const img = new Image();
      img.src = ART_FILES[key];
      try {
        await img.decode();
        return [key, img] as const;
      } catch {
        return [key, undefined] as const;
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, v]) => v)) as Art;
}

/* ------------------------------------------------------------------ crop */

export type Crop = { zoom: number; x: number; y: number };
export const CROP0: Crop = { zoom: 1, x: 0, y: 0 };

/**
 * Cover-fit `iw x ih` into `w x h`, never leaving a gap.
 * Portraits are anchored above centre because that is where faces live, which
 * is what lets an uncropped phone photo land right on the first try.
 * `crop.x/y` are user nudges expressed as a fraction of the target box.
 */
export function fitCover(
  iw: number,
  ih: number,
  w: number,
  h: number,
  crop: Crop = CROP0,
) {
  const s = Math.max(w / iw, h / ih) * Math.max(1, crop.zoom);
  const dw = iw * s;
  const dh = ih * s;
  const focusY = ih / iw >= 1.15 ? 0.34 : 0.5;
  const dx = Math.min(0, Math.max(w - dw, (w - dw) / 2 + crop.x * w));
  const dy = Math.min(0, Math.max(h - dh, (h - dh) * focusY + crop.y * h));
  return { dx, dy, dw, dh };
}

/* ------------------------------------------------------------- primitives */

type Ctx = CanvasRenderingContext2D;

function drawCover(
  ctx: Ctx,
  img: CanvasImageSource,
  iw: number,
  ih: number,
  x: number,
  y: number,
  w: number,
  h: number,
  crop: Crop,
) {
  const { dx, dy, dw, dh } = fitCover(iw, ih, w, h, crop);
  ctx.drawImage(img, x + dx, y + dy, dw, dh);
}

/** Cover-fit a loaded asset, reading its intrinsic size. */
function art(
  ctx: Ctx,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  crop: Crop = CROP0,
) {
  if (!img) return;
  drawCover(ctx, img, img.naturalWidth, img.naturalHeight, x, y, w, h, crop);
}

/** Draw an asset at a target height, keeping its aspect. Returns its width. */
function mark(
  ctx: Ctx,
  img: HTMLImageElement | undefined,
  x: number,
  y: number,
  h: number,
  align: "left" | "center" = "left",
) {
  if (!img) return 0;
  const w = (img.naturalWidth / img.naturalHeight) * h;
  ctx.drawImage(img, align === "center" ? x - w / 2 : x, y, w, h);
  return w;
}

/** Largest size <= `start` at which `text` fits `maxW`. */
function fitDisplay(ctx: Ctx, text: string, maxW: number, start: number) {
  let size = start;
  for (; size > 14; size -= 2) {
    ctx.font = D(size);
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

function truncate(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(out + "…").width > maxW) {
    out = out.slice(0, -1);
  }
  return out + "…";
}

/* ------------------------------------------------------ the scenery, drawn */
/* Lifted off the event illustration so the pass is built out of the same
   shapes: a terracotta roof, a sand bank, coconut palms. Every one is a heavy
   black keyline over a flat fill, which is the whole look. */

/** Keyline weight, scaled off the shape so it holds at any size. */
function keyline(ctx: Ctx, px: number) {
  ctx.strokeStyle = C.outline;
  ctx.lineWidth = Math.max(2, px);
}

/** A run of terracotta roof tiles: flat fill, vertical ribs, heavy eave. */
function roof(ctx: Ctx, x: number, y: number, w: number, h: number, fill = C.pink) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);

  const pitch = h * 0.62;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  keyline(ctx, h * 0.06);
  ctx.beginPath();
  for (let rib = x + pitch / 2; rib < x + w; rib += pitch) {
    ctx.moveTo(rib, y);
    ctx.lineTo(rib, y + h * 0.72);
  }
  ctx.moveTo(x, y + h * 0.72);
  ctx.lineTo(x + w, y + h * 0.72);
  ctx.stroke();
  ctx.restore();

  keyline(ctx, h * 0.09);
  ctx.strokeRect(x, y, w, h);
}

/** A bank of sand with a soft crest. */
function dune(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const crest = () => {
    ctx.moveTo(x, y + h * 0.52);
    ctx.bezierCurveTo(x + w * 0.3, y - h * 0.18, x + w * 0.62, y + h * 0.52, x + w, y + h * 0.1);
  };
  ctx.beginPath();
  crest();
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fillStyle = C.sand;
  ctx.fill();

  ctx.beginPath();
  crest();
  keyline(ctx, h * 0.07);
  ctx.stroke();
}

/** A coconut palm: pale leaning trunk, a fan of fronds, three nuts. */
function palm(ctx: Ctx, x: number, baseY: number, h: number, dir: 1 | -1) {
  const topX = x + dir * h * 0.2;
  const topY = baseY - h;
  const tw = Math.max(5, h * 0.042);
  const pen = Math.max(2.5, h * 0.013);

  ctx.beginPath();
  ctx.moveTo(x - tw, baseY);
  ctx.quadraticCurveTo(x + dir * h * 0.01, baseY - h * 0.55, topX - tw * 0.55, topY);
  ctx.lineTo(topX + tw * 0.55, topY);
  ctx.quadraticCurveTo(x + dir * h * 0.05 + tw, baseY - h * 0.55, x + tw, baseY);
  ctx.closePath();
  ctx.fillStyle = C.cream;
  ctx.fill();
  keyline(ctx, pen);
  ctx.stroke();

  const R = h * 0.44;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI;
    const droop = R * 0.24;
    const ex = topX + Math.cos(a) * R;
    const ey = topY + Math.sin(a) * R * 0.7 + droop;
    const mx = topX + Math.cos(a) * R * 0.55;
    const my = topY + Math.sin(a) * R * 0.6 - R * 0.2;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.quadraticCurveTo(mx, my + R * 0.4, topX, topY);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? C.line : C.ink;
    ctx.fill();
    keyline(ctx, pen);
    ctx.stroke();
  }

  ctx.fillStyle = C.sand;
  for (const [ox, oy] of [[-0.9, 0.5], [0.9, 0.5], [0, 1.1]]) {
    ctx.beginPath();
    ctx.arc(topX + ox * tw, topY + oy * tw, tw * 0.62, 0, Math.PI * 2);
    ctx.fill();
    keyline(ctx, pen);
    ctx.stroke();
  }
}

/**
 * Sand and palms across the foot of a photo box, overlapping the bottom of the
 * shot. Faces sit in the top third of a cover-fit portrait, and the palms hug
 * the two edges, so this lands on the background rather than on the builder.
 * The caller clips to the photo, which is what keeps it inside the window.
 */
function beachFront(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const sandH = h * 0.085;
  const sandY = y + h - sandH;
  dune(ctx, x - 4, sandY, w + 8, sandH + 8);
  palm(ctx, x + w * 0.01, sandY + sandH * 0.55, h * 0.44, 1);
  palm(ctx, x + w * 0.99, sandY + sandH * 0.66, h * 0.32, -1);
}

/** The four-point sparkle used as a bullet across the HH Goa site. */
function sparkle(ctx: Ctx, cx: number, cy: number, r: number, fill: string) {
  const w = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + w, cy - w, cx + r, cy);
  ctx.quadraticCurveTo(cx + w, cy + w, cx, cy + r);
  ctx.quadraticCurveTo(cx - w, cy + w, cx - r, cy);
  ctx.quadraticCurveTo(cx - w, cy - w, cx, cy - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function chip(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  bg: string,
  fg: string,
  maxW = Infinity,
) {
  ctx.font = M(size, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const padX = size * 0.75;
  const label = truncate(ctx, text, maxW - padX * 2);
  const w = ctx.measureText(label).width + padX * 2;
  const h = size * 2.1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.fillText(label, x + padX, y + h / 2 + size * 0.04);
  return w;
}

function label(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string) {
  ctx.font = M(size, 700);
  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = `${size * 0.14}px`;
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
}

/** Vertical fade to the card ground, so text never fights the illustration. */
function scrimY(ctx: Ctx, x: number, y0: number, y1: number, w: number, to = C.deep) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hexA(to, 0));
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(x, Math.min(y0, y1), w, Math.abs(y1 - y0));
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ------------------------------------------------------- builder title gen */

const ADJ = [
  "SUNRISE", "MIDNIGHT", "SALTWATER", "LOW-LATENCY", "FERAL", "CAFFEINATED",
  "ROGUE", "DEEP-END", "MONSOON", "HIGH-TIDE", "BAREFOOT", "OVERCLOCKED",
  "ZERO-DAY", "OFF-GRID", "TERMINAL", "PRE-DAWN",
];

const NOUN = [
  "SHIPPER", "MERGE GOBLIN", "PROMPT SMITH", "SYSTEMS GREMLIN", "DEMO DEALER",
  "PIXEL BENDER", "LEDGER WITCH", "LATENCY HUNTER", "BUILD DOCTOR",
  "SCHEMA PIRATE", "AGENT WRANGLER", "REFACTOR MONK", "DEPLOY JOCKEY",
  "EDGE RUNNER", "CACHE WARLORD", "NIGHT OWL",
];

/** FNV-1a: stable across reloads so a builder keeps the title they shared. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function builderTitle(name: string, stack: string, salt = 0) {
  const h = hash(`${name.trim().toLowerCase()}|${stack.trim().toLowerCase()}|${salt}`);
  return `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
}

export function builderCode(name: string, stack: string) {
  const h = hash(`${name.trim().toLowerCase()}|${stack.trim().toLowerCase()}`);
  return `HHG26-${h.toString(16).toUpperCase().padStart(8, "0").slice(0, 4)}`;
}

export type Shot = { img: CanvasImageSource; w: number; h: number; crop: Crop };

/* ----------------------------------------------------------- compositions */

export const BADGE_W = 1024;
export const BADGE_H = 1536;
export const CARD_W = 1200;
export const CARD_H = 675;

function ctxOf(canvas: HTMLCanvasElement, w: number, h: number) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 0, w, h);
  return ctx;
}

/**
 * The strip of sand the house stands on, carrying the place and the hashtag.
 * Ink on sand measures 4.9:1, so the small caps here are still readable type.
 */
function groundBar(ctx: Ctx, w: number, h: number, right: string) {
  const barH = 84;
  const y = h - barH;
  ctx.fillStyle = C.sand;
  ctx.fillRect(0, y, w, barH);
  keyline(ctx, 6);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();

  ctx.font = M(24, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "2px";
  ctx.fillStyle = C.outline;
  ctx.fillText(`${EVENT.place}  ·  ${EVENT.dates}`, 48, y + barH / 2);
  ctx.textAlign = "right";
  ctx.fillText(right, w - 48, y + barH / 2);
  ctx.letterSpacing = "0px";
}

export type IdFields = { name: string; stack: string; title: string };

/**
 * Format B, portrait: the lanyard badge. 2:3 so it reads as a physical event
 * pass rather than a banner.
 *
 * The card is the house from the event artwork, stacked: tiled roof, the
 * illustration itself under it, then the builder's photo as a shuttered window,
 * and sand at the foot. Bougainvillea hangs off both ends of the roofline.
 */
export function renderBadge(
  canvas: HTMLCanvasElement,
  shot: Shot | null,
  a: Art,
  f: IdFields,
) {
  const W = BADGE_W, H = BADGE_H;
  const ctx = ctxOf(canvas, W, H);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 54);
  ctx.clip();
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 0, W, H);

  // Roof, then the house illustration behind the lockup.
  const roofY = 92, roofH = 72;
  const bandY = roofY + roofH, bandH = 250;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, W, bandH);
  ctx.clip();
  art(ctx, a.house, 0, bandY - 96, W, bandH + 200);
  // Light enough to keep the pinks and yellows, dark enough for the lockup.
  ctx.fillStyle = hexA(C.ink, 0.34);
  ctx.fillRect(0, bandY, W, bandH);
  ctx.restore();
  scrimY(ctx, 0, bandY + bandH - 120, bandY + bandH, W);

  roof(ctx, 0, roofY, W, roofH);

  // Lanyard slot, punched through the roof line.
  ctx.beginPath();
  ctx.roundRect(W / 2 - 150, 34, 300, 34, 17);
  ctx.fillStyle = C.ink;
  ctx.fill();
  keyline(ctx, 5);
  ctx.stroke();

  mark(ctx, a.lockup, W / 2, bandY + 54, 168, "center");

  // Photo, edge to edge inside the card margin.
  const px = 72, py = 430, pw = W - px * 2, ph = 682;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 30);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.clip();
  if (shot) drawCover(ctx, shot.img, shot.w, shot.h, px, py, pw, ph, shot.crop);
  beachFront(ctx, px, py, pw, ph);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 30);
  keyline(ctx, 8);
  ctx.stroke();

  // Serial row, straight under the window.
  const mx = 72;
  ctx.font = M(21, 700);
  ctx.letterSpacing = "2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(builderCode(f.name, f.stack), mx, 1152);
  ctx.textAlign = "right";
  ctx.fillStyle = C.sea;
  ctx.fillText("SELF-ISSUED BUILDER PASS", W - mx, 1152);
  ctx.letterSpacing = "0px";

  ctx.beginPath();
  ctx.moveTo(mx, 1176);
  ctx.lineTo(W - mx, 1176);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Details.
  const textW = 640;
  sparkle(ctx, mx + 8, 1210, 11, C.pink);
  label(ctx, "BUILDER", mx + 30, 1218, 22, C.sea);

  const nm = (f.name.trim() || "YOUR NAME").toUpperCase();
  ctx.font = D(fitDisplay(ctx, nm, textW, 100));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(nm, mx, 1294);

  // Sand chip, ink type: the title reads at 4.9:1 instead of pink's 1.8:1.
  chip(ctx, f.title, mx, 1320, 26, C.sand, C.outline, textW);

  ctx.font = M(28, 700);
  ctx.fillStyle = C.cream;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(truncate(ctx, f.stack.trim() || "BUILDER", textW), mx, 1424);

  // QR back to the event, on a yellow plate with the same heavy keyline.
  const qs = 150;
  const qx = W - mx - qs, qy = 1210;
  ctx.beginPath();
  ctx.roundRect(qx - 10, qy - 10, qs + 20, qs + 20, 16);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  keyline(ctx, 5);
  ctx.stroke();
  if (a.qr) ctx.drawImage(a.qr, qx, qy, qs, qs);
  ctx.font = M(17, 700);
  ctx.fillStyle = C.sea;
  ctx.textAlign = "center";
  ctx.fillText(EVENT.site, qx + qs / 2, qy + qs + 36);

  groundBar(ctx, W, H, EVENT.tag);

  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 54);
  keyline(ctx, 9);
  ctx.stroke();
  return canvas;
}

/** Format B, landscape: fills the X timeline edge to edge. */
export function renderId(
  canvas: HTMLCanvasElement,
  shot: Shot | null,
  a: Art,
  f: IdFields,
) {
  const ctx = ctxOf(canvas, CARD_W, CARD_H);
  const roofH = 46;
  art(ctx, a.house, 0, roofH, CARD_W, CARD_H - roofH);

  // The illustration keeps the left third; the type column behind it goes
  // solid, because half-lit shutters under a name is just noise.
  const g = ctx.createLinearGradient(400, 0, 620, 0);
  g.addColorStop(0, hexA(C.deep, 0));
  g.addColorStop(1, C.deep);
  ctx.fillStyle = g;
  ctx.fillRect(400, 0, CARD_W - 400, CARD_H);
  ctx.fillStyle = hexA(C.ink, 0.18);
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // and everything under the photo, where the serial row lands. Full width, or
  // the fade leaves a hard vertical seam where it meets the column gradient.
  scrimY(ctx, 0, 430, 486, CARD_W);
  ctx.fillStyle = C.deep;
  ctx.fillRect(0, 486, CARD_W, CARD_H - 84 - 486);

  roof(ctx, 0, 0, CARD_W, roofH);

  const px = 56, py = 80, pw = 336, ph = 390;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 24);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.clip();
  if (shot) drawCover(ctx, shot.img, shot.w, shot.h, px, py, pw, ph, shot.crop);
  beachFront(ctx, px, py, pw, ph);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 24);
  keyline(ctx, 7);
  ctx.stroke();

  label(ctx, builderCode(f.name, f.stack), px, py + ph + 44, 22, C.yellow);
  ctx.font = M(19);
  ctx.fillStyle = C.sea;
  ctx.letterSpacing = "2px";
  ctx.fillText("SELF-ISSUED BUILDER PASS", px, py + ph + 74);
  ctx.letterSpacing = "0px";

  // Right column.
  const x = 464;
  const textW = CARD_W - x - 220;

  mark(ctx, a.lockup, x, 74, 112);

  const nm = (f.name.trim() || "YOUR NAME").toUpperCase();
  ctx.font = D(fitDisplay(ctx, nm, textW, 104));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(nm, x, 298);

  chip(ctx, f.title, x, 324, 26, C.sand, C.outline, textW);

  label(ctx, "STACK / ROLE", x, 436, 19, C.sea);
  ctx.font = M(32, 700);
  ctx.fillStyle = C.cream;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, f.stack.trim() || "BUILDER", textW), x, 480);

  const qs = 150;
  const qx = CARD_W - 56 - qs, qy = 82;
  ctx.beginPath();
  ctx.roundRect(qx - 9, qy - 9, qs + 18, qs + 18, 14);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  keyline(ctx, 5);
  ctx.stroke();
  if (a.qr) ctx.drawImage(a.qr, qx, qy, qs, qs);
  mark(ctx, a.goa, qx + qs / 2, qy + qs + 22, 46, "center");

  groundBar(ctx, CARD_W, CARD_H, EVENT.tag);
  return canvas;
}

/* ------------------------------------------------------------------ misc */

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))),
      "image/png",
    ),
  );
}
