import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { head } from "@vercel/blob";
import { EVENT } from "@/lib/render";

const ID = /^[a-f0-9]{12}$/;

/** Resolve a share id to its hosted PNG. Returns null for anything unknown. */
async function imageUrl(raw: string) {
  // No env gate: the store may be wired by token or by OIDC, and head() already
  // fails closed into the catch when neither is available.
  if (!ID.test(raw)) return null;
  try {
    const blob = await head(`f/${raw}.png`);
    return blob.url;
  } catch {
    return null;
  }
}

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const url = await imageUrl(id);
  if (!url) return { title: "HH Goa 2026" };

  const title = `HH Goa 2026 · ${EVENT.tag}`;
  const description = `Hacker House Goa 2026, ${EVENT.dates}, ${EVENT.place}. Make your own frame or builder ID in one upload.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url, width: 1200, height: 675, alt: "HH Goa 2026 graphic" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [url],
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { id } = await params;
  const url = await imageUrl(id);
  if (!url) notFound();

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[url('/night-sunrise.webp')] bg-cover bg-[center_38%]"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink/80" />
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-5 py-12 sm:px-8">
        <div className="flex w-full items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lockup.svg" alt="Hacker House Goa" width={57} height={50} className="h-12 w-auto" />
          <span className="font-mono text-[10px] tracking-[0.2em] text-sea uppercase sm:text-xs">
            {EVENT.place} · {EVENT.dates}
          </span>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`HH Goa 2026 graphic, ${EVENT.tag}`}
          width={1200}
          height={675}
          fetchPriority="high"
          className="w-full rounded-2xl border-4 border-yellow"
        />

        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="display text-5xl text-yellow sm:text-6xl">
            Make yours in one upload
          </h1>
          <p className="max-w-md font-mono text-sm leading-relaxed text-cream">
            Drop a photo, pick a frame or a builder pass, download it, post it
            with {EVENT.tag}. No signup.
          </p>
          <Link
            href="/"
            className="rounded-full bg-yellow px-8 py-4 font-mono text-sm font-bold tracking-widest text-ink uppercase transition-transform hover:scale-[1.03]"
          >
            Build my frame
          </Link>
        </div>
      </div>
    </main>
  );
}
