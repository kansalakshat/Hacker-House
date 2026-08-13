# HH Goa 2026 Frame / Builder Pass generator

Drop in a photo, get an on-brand Hacker House Goa 2026 graphic, download it, post
it with `#FrameInGoa`. No login, no signup gate, no manual cropping.

Four outputs, one screen:

| Format | Output | Notes |
|---|---|---|
| **Frame** | 1024x1024 PNG | Profile ring. Everything that matters sits inside the circle X crops to, with the गोवा medallion at six o'clock. |
| **Builder pass, lanyard** | 1024x1536 PNG | Portrait event badge: lanyard slot, serial, QR back to hhgoa.com. |
| **Builder pass, timeline** | 1200x675 PNG | Same details, landscape, fills the X timeline edge to edge. |
| **Team** | 1200x675 PNG | Up to four builders in one combined frame. |

## Art direction

HH Goa after dark. The event's own illustrations (`Sun rise`, `hackers`,
`footer trees` from hhgoa.com) are colour-graded to night with a duotone ramp
that keeps only sun yellow and bougainvillea pink lit, so the artwork stays
recognisably theirs instead of being redrawn badly. The real
HACKER / गोवा / HOUSE lockup is used as-is rather than reconstructed in type.

- Ground `#03080a`, cards `#061a18`, hairlines `#12503c`
- Sun yellow `#fee13c`, bougainvillea pink `#ff0080`, cream `#eaf6ef`, sea `#7fd3b0`
- Imbue for display, Victor Mono for everything else, both from the event site

## How it works

Rendering is plain Canvas 2D in the browser, so upload to finished graphic is a
few milliseconds, not a loading screen. Nothing is uploaded to draw the image.

- **Photos**: jpg, png, webp and HEIC. `createImageBitmap` handles the common
  formats plus HEIC on Apple devices; a wasm decoder (`heic-to`) is dynamically
  imported only when the native decode fails, so the usual path never downloads
  it. EXIF rotation is honoured, and anything over 2400px is downscaled at decode
  time so phones do not choke on a 48MP original.
- **Cropping**: photos are cover-fitted and portraits are anchored above centre,
  which is where faces actually sit. Drag the preview or use the zoom slider to
  adjust. No crop step is required.

### Share to X

`x.com/intent/post` cannot attach a file, so the graphic is hosted and shared as
a link whose OG image is the graphic itself:

1. The browser renders a 1200x675 landscape version. The square frame and the
   portrait badge each get a dedicated landscape card, so the preview is never a
   letterboxed square or a sliver of a badge.
2. `POST /api/share` validates the PNG and stores it in Vercel Blob under a
   random 12-hex-character id.
3. The X intent opens with the caption pre-filled plus `/s/<id>`, whose
   `generateMetadata` sets `og:image` and `twitter:card=summary_large_image` to
   the stored PNG.

Where the browser supports `navigator.share` with files, an extra button hands
the PNG straight to the X app instead.

If blob storage is unavailable the button still opens a pre-filled post, minus
the link, and says so.

## Running locally

```bash
npm install
npm run dev
```

Sharing needs a blob store; everything else works without one.

## Deploying

The share flow needs `BLOB_READ_WRITE_TOKEN`. On Vercel:

```bash
npm i -g vercel
vercel link
```

Create a Blob store from the project's **Storage** tab in the Vercel dashboard
and connect it to the project. That sets `BLOB_READ_WRITE_TOKEN` automatically.
Then:

```bash
vercel env pull .env.local   # so local dev can share too
vercel deploy --prod
```

Set `NEXT_PUBLIC_SITE_URL` to the final domain if you are not on a
`*.vercel.app` URL, so OG tags resolve absolutely.

Any host works as long as it runs Next.js server routes and provides that token.

## 3D preview

The stage has a 3D/Flat toggle. In 3D the generated PNG is mapped onto a
physical card you can tilt; the flat canvas stays mounted and is still exactly
what gets downloaded and shared. three.js loads only when 3D is opened
(`next/dynamic`, `ssr: false`).

Scenery is optional and additive. Drop these Sketchfab downloads into `public/`
and each one appears on its own, already credited in the UI:

| File | Model | Author | License |
|---|---|---|---|
| `palm.glb` | [Coconut Palm](https://sketchfab.com/3d-models/coconut-palm-26e787f2ff2e4c0fb004c3b0210805a3) | evolveduk | CC BY 4.0 |
| `water.glb` | [Water Animation](https://sketchfab.com/3d-models/water-animation-e54ff76bef854b128af8d20cf9c03729) | Artise1 | CC BY 4.0 |
| `beach.glb` | [Beach kit](https://sketchfab.com/3d-models/beach-kit-6e0e5cc33a1542679f8383e9e260eb90) | Jungle Jim | CC BY 4.0 |
| `beach-scan.glb` | [Ibiza Benirras Beach at Sunset](https://sketchfab.com/3d-models/ibiza-benirras-beach-at-sunset-9298c3a7f2384a93ae8f387ae99a85a1) | Miguelangelo Rosario | CC BY 4.0 |

Download each as **glTF Binary (.glb)**, rename to the filename above. Models
are auto-scaled and placed, so no manual transforms are needed. All four are
CC-BY: the credit line under the stage is a licence obligation, do not remove
it. Add or change entries in `MODELS` in `components/PassScene.tsx`.

The beach scan is 186k faces; use it *instead of* the palm and kit rather than
alongside them, and expect a slower first load on mobile.

## Checks

```bash
npm run check   # crop maths and builder-title generator
npm run lint
npm run build
```

`lib/render.test.mjs` covers the pure logic: cover-fit never leaves a gap at any
aspect ratio or zoom, portraits bias upward, and builder titles are stable per
person and spread across the pool.

## Layout of the code

```
app/page.tsx           masthead, hero, footer
app/api/share/route.ts PNG validation + blob upload
app/s/[id]/page.tsx    share page, OG tags point at the stored PNG
components/Studio.tsx  the tool: intake, state, controls, download, share
lib/render.ts          every canvas renderer, palette, builder-title generator
public/night-*.webp    HH Goa illustrations graded to night
public/lockup.svg      HACKER / गोवा / HOUSE
public/goa.svg         the गोवा medallion used on the frame
public/qr.png          static QR to hhgoa.com, baked once
public/og.png          link preview for the tool itself
```
