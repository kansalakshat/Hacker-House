import ReactDOM from "react-dom";
import { Journey } from "@/components/Journey";
import { Studio } from "@/components/Studio";
import { EVENT } from "@/lib/render";
import { MODELS } from "@/lib/models";

export default function Home() {
  // The models are the long pole, and nothing used to ask for them until the
  // three.js chunk had downloaded and the canvas had mounted. Preloading from
  // the document head starts them with the HTML instead, seconds earlier, at
  // low priority so the scripts and fonts still win the pipe first.
  for (const m of MODELS) {
    ReactDOM.preload(m.file, { as: "fetch", fetchPriority: "low" });
  }

  return (
    <main>
      <a
        href="#studio"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-yellow focus:px-5 focus:py-3 focus:font-mono focus:text-sm focus:font-bold focus:text-ink"
      >
        Skip to the generator
      </a>

      <Journey />

      <Studio />

      <footer className="relative isolate overflow-hidden border-t-2 border-line">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[url('/night-trees.webp')] bg-cover bg-center opacity-70"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink/70" />
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <p className="display max-w-md text-4xl text-yellow sm:text-5xl">
            {EVENT.motto}
          </p>
          <div className="flex flex-col gap-2 font-mono text-xs text-cream">
            <a
              href="https://hhgoa.com"
              className="underline underline-offset-4 hover:text-yellow"
            >
              {EVENT.site}
            </a>
            <a
              href={`https://x.com/search?q=${encodeURIComponent(EVENT.tag)}`}
              className="underline underline-offset-4 hover:text-yellow"
            >
              {EVENT.tag} on X
            </a>
            <span className="max-w-xs text-sea">
              Your photo stays in the browser. Only the graphic you share to X
              gets uploaded.
            </span>
          </div>
        </div>

        {/* Model attribution, off the scene and down here where credits belong. */}
        <div className="mx-auto max-w-6xl px-5 pb-10 sm:px-8">
          <p className="border-t border-line pt-6 font-mono text-[10px] leading-relaxed text-sea/80">
            <span className="text-sea">3D models · </span>
            {MODELS.map((c, i) => (
              <span key={c.slot}>
                {i > 0 && " · "}
                {c.url ? (
                  <a href={c.url} className="underline underline-offset-2 hover:text-yellow">
                    {c.title}
                  </a>
                ) : (
                  c.title
                )}
                {c.author && ` by ${c.author}`} ({c.license})
              </span>
            ))}
          </p>
        </div>
      </footer>
    </main>
  );
}
