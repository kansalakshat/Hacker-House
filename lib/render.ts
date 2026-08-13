/**
 * HH Goa 2026 graphic renderers.
 *
 * Everything is drawn on a 2D canvas so generation is synchronous and instant.
 * The look is HH Goa after dark: the event's own illustrations colour-graded to
 * night, the real HACKER / गोवा / HOUSE lockup, sun yellow and bougainvillea
 * pink as the only lit colours.
 */

export const C = {
  ink: "#03080a",
  deep: "#061a18",
  panel: "#0a2a22",
  line: "#12503c",
  yellow: "#fee13c",
  pink: "#ff0080",
  cream: "#eaf6ef",
  sea: "#7fd3b0",
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
  sunrise: "/night-sunrise.webp",
  trees: "/night-trees.webp",
  hackers: "/night-hackers.webp",
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

/** Display text with the hard offset shadow from the HH Goa wordmark. */
function stamp(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  shadow: string,
  align: CanvasTextAlign = "left",
) {
  ctx.font = D(size);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const off = Math.max(3, size * 0.045);
  ctx.fillStyle = shadow;
  ctx.fillText(text, x + off, y + off);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
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

/**
 * Lay `text` along a circle. `dir` is +1 for the top of the ring (reads
 * left to right clockwise) and -1 for the bottom.
 */
function arcText(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  r: number,
  centerAngle: number,
  dir: 1 | -1,
  tracking = 0,
) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width + tracking);
  const total = widths.reduce((a, b) => a + b, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let angle = centerAngle - (dir * total) / (2 * r);
  for (let i = 0; i < chars.length; i++) {
    const a = angle + (dir * (widths[i] / 2)) / r;
    ctx.save();
    ctx.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    ctx.rotate(a + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += (dir * widths[i]) / r;
  }
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

/* ------------------------------------------------------------- the ring */

export type Shot = { img: CanvasImageSource; w: number; h: number; crop: Crop };

/**
 * The PFP ring: photo inside, yellow band outside, arc-set wordmark on top and
 * the गोवा medallion at six o'clock. Sized off `R` so the same artwork serves
 * the 1024px avatar and the small heads on a team card.
 */
function drawRing(ctx: Ctx, cx: number, cy: number, R: number, shot: Shot | null, a: Art) {
  const band = R * 0.172;
  const rIn = R - band;
  const k = R / 512; // scale factor against the reference 1024px render
  const big = R >= 150;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, rIn + 2 * k, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = C.deep;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (shot) {
    drawCover(ctx, shot.img, shot.w, shot.h, cx - rIn, cy - rIn, rIn * 2, rIn * 2, shot.crop);
  }
  ctx.restore();

  // Yellow band.
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.arc(cx, cy, rIn, 0, Math.PI * 2, true);
  ctx.fillStyle = C.yellow;
  ctx.fill("evenodd");

  // Dark notch under the medallion.
  const notch = 0.56;
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI / 2 - notch, Math.PI / 2 + notch);
  ctx.arc(cx, cy, rIn, Math.PI / 2 + notch, Math.PI / 2 - notch, true);
  ctx.closePath();
  ctx.fillStyle = C.deep;
  ctx.fill();

  // Keyline where the photo meets the band.
  ctx.beginPath();
  ctx.arc(cx, cy, rIn, 0, Math.PI * 2);
  ctx.strokeStyle = C.deep;
  ctx.lineWidth = 10 * k;
  ctx.stroke();

  const rText = R - band * 0.5;

  // Below roughly 300px across, ring lettering turns to noise.
  if (big) {
    ctx.fillStyle = C.ink;
    ctx.font = D(58 * k);
    arcText(ctx, `${EVENT.name} ${EVENT.year}`, cx, cy, rText + 6 * k, -Math.PI / 2, 1, 3 * k);
  }

  sparkle(ctx, cx - rText, cy, 17 * k, C.pink);
  sparkle(ctx, cx + rText, cy, 17 * k, C.pink);

  // The गोवा medallion, centred on the notch. mark() draws from the top edge,
  // so offset by half or it hangs off the bottom of the canvas. Skipped on the
  // small team heads, where it would only ever be a smudge.
  if (big) {
    const medal = band * 1.4;
    mark(ctx, a.goa, cx, cy + rIn - medal / 2, medal, "center");
  }
}

/* ----------------------------------------------------------- compositions */

export const PFP_SIZE = 1024;
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

/** Format A: the square avatar. X crops it to the inscribed circle. */
export function renderPfp(canvas: HTMLCanvasElement, shot: Shot | null, a: Art) {
  const S = PFP_SIZE;
  const ctx = ctxOf(canvas, S, S);
  art(ctx, a.sunrise, 0, 0, S, S);
  ctx.fillStyle = hexA(C.ink, 0.32);
  ctx.fillRect(0, 0, S, S);

  // Corner marks, only visible when the square itself is posted.
  ctx.font = M(22, 700);
  ctx.letterSpacing = "3px";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = C.yellow;
  ctx.fillText(EVENT.datesShort, 28, 26);
  ctx.textAlign = "right";
  ctx.fillStyle = C.sea;
  ctx.fillText("'26", S - 28, 26);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = C.cream;
  ctx.fillText(EVENT.tag, 28, S - 28);
  ctx.textAlign = "right";
  ctx.fillStyle = C.pink;
  ctx.fillText("GOA", S - 28, S - 28);
  ctx.letterSpacing = "0px";

  drawRing(ctx, S / 2, S / 2, S / 2, shot, a);
  return canvas;
}

function bottomBar(ctx: Ctx, w: number, h: number, right: string) {
  const y = h - 74;
  ctx.fillStyle = C.yellow;
  ctx.fillRect(0, y, w, 74);
  ctx.font = M(24, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "2px";
  ctx.fillStyle = C.ink;
  ctx.fillText(`${EVENT.place}  ·  ${EVENT.dates}`, 48, y + 42);
  ctx.textAlign = "right";
  ctx.fillText(right, w - 48, y + 42);
  ctx.letterSpacing = "0px";
}

export type IdFields = { name: string; stack: string; title: string };

/**
 * Format B, portrait: the lanyard badge. 2:3 so it reads as a physical event
 * pass rather than a banner.
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

  // Night beach behind the lockup.
  const bandY = 112, bandH = 292;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, W, bandH);
  ctx.clip();
  art(ctx, a.sunrise, 0, bandY - 300, W, bandH + 380);
  ctx.fillStyle = hexA(C.ink, 0.72);
  ctx.fillRect(0, bandY, W, bandH);
  ctx.restore();
  scrimY(ctx, 0, bandY + bandH - 130, bandY + bandH, W);
  scrimY(ctx, 0, bandY + 80, bandY, W);

  // Lanyard slot.
  ctx.beginPath();
  ctx.roundRect(W / 2 - 150, 44, 300, 34, 17);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 3;
  ctx.stroke();

  mark(ctx, a.lockup, W / 2, bandY + 62, 168, "center");

  // Photo.
  const px = 72, py = 424, pw = W - 144, ph = 736;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 36);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.clip();
  if (shot) drawCover(ctx, shot.img, shot.w, shot.h, px, py, pw, ph, shot.crop);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 36);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 7;
  ctx.stroke();

  // Serial row, straight under the photo.
  ctx.font = M(21, 700);
  ctx.letterSpacing = "2px";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(builderCode(f.name, f.stack), px, 1206);
  ctx.textAlign = "right";
  ctx.fillStyle = C.sea;
  ctx.fillText(`${EVENT.dates}  ·  ${EVENT.place}`, W - px, 1206);
  ctx.letterSpacing = "0px";

  ctx.beginPath();
  ctx.moveTo(px, 1230);
  ctx.lineTo(W - px, 1230);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Details.
  const textW = 640;
  label(ctx, "BUILDER", px, 1284, 22, C.sea);

  const nm = (f.name.trim() || "YOUR NAME").toUpperCase();
  ctx.font = D(fitDisplay(ctx, nm, textW, 100));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(nm, px, 1360);

  chip(ctx, f.title, px, 1386, 26, C.pink, C.cream, textW);

  ctx.font = M(28, 700);
  ctx.fillStyle = C.cream;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(truncate(ctx, f.stack.trim() || "BUILDER", textW), px, 1486);

  // QR back to the event.
  const qs = 168;
  const qx = W - 72 - qs, qy = 1272;
  ctx.beginPath();
  ctx.roundRect(qx - 10, qy - 10, qs + 20, qs + 20, 16);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  if (a.qr) ctx.drawImage(a.qr, qx, qy, qs, qs);
  ctx.font = M(17, 700);
  ctx.fillStyle = C.sea;
  ctx.textAlign = "center";
  ctx.fillText(EVENT.site, qx + qs / 2, qy + qs + 40);

  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 54);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 7;
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
  art(ctx, a.hackers, 0, 0, CARD_W, CARD_H);

  const g = ctx.createLinearGradient(330, 0, 700, 0);
  g.addColorStop(0, hexA(C.deep, 0));
  g.addColorStop(1, hexA(C.deep, 0.97));
  ctx.fillStyle = g;
  ctx.fillRect(330, 0, CARD_W - 330, CARD_H);
  ctx.fillStyle = hexA(C.ink, 0.35);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Photo.
  const px = 56, py = 74, pw = 292, ph = 376;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 26);
  ctx.fillStyle = C.ink;
  ctx.fill();
  ctx.clip();
  if (shot) drawCover(ctx, shot.img, shot.w, shot.h, px, py, pw, ph, shot.crop);
  ctx.restore();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 26);
  ctx.strokeStyle = C.yellow;
  ctx.lineWidth = 6;
  ctx.stroke();

  label(ctx, builderCode(f.name, f.stack), px, py + ph + 46, 22, C.yellow);
  ctx.font = M(19);
  ctx.fillStyle = C.sea;
  ctx.letterSpacing = "2px";
  ctx.fillText("SELF-ISSUED BUILDER PASS", px, py + ph + 76);
  ctx.letterSpacing = "0px";

  // Right column.
  const x = 412;
  const textW = 1200 - x - 220;

  mark(ctx, a.lockup, x, 56, 118);

  const nm = (f.name.trim() || "YOUR NAME").toUpperCase();
  ctx.font = D(fitDisplay(ctx, nm, textW, 104));
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.yellow;
  ctx.fillText(nm, x, 288);

  chip(ctx, f.title, x, 314, 26, C.pink, C.cream, textW);

  label(ctx, "STACK / ROLE", x, 428, 19, C.sea);
  ctx.font = M(32, 700);
  ctx.fillStyle = C.cream;
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, f.stack.trim() || "BUILDER", textW), x, 472);

  const qs = 150;
  const qx = CARD_W - 56 - qs;
  ctx.beginPath();
  ctx.roundRect(qx - 9, 66 - 9, qs + 18, qs + 18, 14);
  ctx.fillStyle = C.yellow;
  ctx.fill();
  if (a.qr) ctx.drawImage(a.qr, qx, 66, qs, qs);

  bottomBar(ctx, CARD_W, CARD_H, EVENT.tag);
  return canvas;
}

export type Member = { shot: Shot | null; name: string };

/** The combined team frame. */
export function renderTeam(
  canvas: HTMLCanvasElement,
  members: Member[],
  a: Art,
  teamName: string,
) {
  const ctx = ctxOf(canvas, CARD_W, CARD_H);
  art(ctx, a.trees, 0, 0, CARD_W, CARD_H);
  ctx.fillStyle = hexA(C.ink, 0.28);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  mark(ctx, a.lockup, 52, 40, 104);

  const eyebrow = "TEAM SHIPPING AT";
  ctx.font = M(21, 700);
  ctx.letterSpacing = "3px";
  const ebW = ctx.measureText(eyebrow).width;
  ctx.fillStyle = C.sea;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(eyebrow, CARD_W - 52 - ebW, 70);
  ctx.letterSpacing = "0px";
  sparkle(ctx, CARD_W - 66 - ebW, 62, 10, C.pink);

  const tn = (teamName.trim() || EVENT.name).toUpperCase();
  const tnSize = fitDisplay(ctx, tn, CARD_W - 420, 92);
  stamp(ctx, tn, CARD_W - 52, 150, tnSize, C.yellow, C.ink, "right");

  const n = Math.max(1, members.length);
  const R = n <= 2 ? 142 : n === 3 ? 126 : 110;
  const gap = n <= 2 ? 60 : 40;
  const total = n * R * 2 + (n - 1) * gap;
  let cx = (CARD_W - total) / 2 + R;
  const cy = 368;

  for (const m of members) {
    drawRing(ctx, cx, cy, R, m.shot, a);
    const who = m.name.trim().toUpperCase();
    if (who) {
      ctx.font = M(23, 700);
      const text = truncate(ctx, who, R * 2 + gap - 44);
      const w = ctx.measureText(text).width + 36;
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, cy + R + 18, w, 44, 22);
      ctx.fillStyle = C.ink;
      ctx.fill();
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = C.cream;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cx, cy + R + 41);
    }
    cx += R * 2 + gap;
  }

  bottomBar(ctx, CARD_W, CARD_H, EVENT.tag);
  return canvas;
}

/** Landscape wrapper for Format A, so the X link preview is not letterboxed. */
export function renderPfpShare(
  canvas: HTMLCanvasElement,
  shot: Shot | null,
  a: Art,
  name: string,
) {
  const ctx = ctxOf(canvas, CARD_W, CARD_H);
  art(ctx, a.sunrise, 0, 0, CARD_W, CARD_H);
  ctx.fillStyle = hexA(C.ink, 0.42);
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  drawRing(ctx, 286, 288, 214, shot, a);

  const x = 566;
  const maxW = CARD_W - x - 56;

  mark(ctx, a.lockup, x, 74, 128);

  stamp(ctx, "I'M IN.", x, 344, 116, C.yellow, C.ink);

  const who = name.trim().toUpperCase();
  if (who) {
    ctx.font = M(26, 700);
    ctx.fillStyle = C.cream;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(truncate(ctx, who, maxW), x, 392);
  }

  chip(ctx, EVENT.tag, x, who ? 420 : 380, 26, C.pink, C.cream, maxW);
  bottomBar(ctx, CARD_W, CARD_H, EVENT.motto);
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
