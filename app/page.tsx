import { FsLockup } from "@/components/brand/logo";
import { PixelHeatmap } from "@/components/brand/PixelHeatmap";
import { MatchView } from "@/components/gauge/MatchView";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <FsLockup size={30} />
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-goal ping-dot" />
          Solana mainnet · live
        </span>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6"><div className="hairline" /></div>

      {/* hero — editorial split: headline left, brief right */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1.5fr_1fr] md:gap-12 md:py-16">
        <div>
          <p className="rise-in eyebrow" style={{ animationDelay: "0.04s" }}>
            Consumer &amp; Fan — World Cup 2026
          </p>
          <h1
            className="rise-in display-tight mt-5 text-[13vw] leading-[0.92] sm:text-6xl md:text-7xl"
            style={{ animationDelay: "0.1s" }}
          >
            Feel the goal
            <br />
            coming before
            <br />
            the market does<span className="text-hot">.</span>
          </h1>
        </div>
        <div className="flex flex-col justify-end gap-6">
          <p
            className="rise-in max-w-sm text-[15px] leading-6 text-muted md:text-base"
            style={{ animationDelay: "0.18s" }}
          >
            Pro traders know pressure surges{" "}
            <span className="text-ink">before</span>{" "}
            the odds move. Foresight turns TxLINE&rsquo;s live odds and pitch events into one number
            — the trading-desk sixth sense, for every fan.
          </p>
          <div className="rise-in flex flex-wrap gap-2" style={{ animationDelay: "0.26s" }}>
            <span className="rounded-full border border-cool/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-cool">
              cool · market
            </span>
            <span className="rounded-full border border-hot/40 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-hot">
              hot · 🔥 brewing
            </span>
          </div>
        </div>
      </section>

      {/* signature: a live pitch-pressure heatmap dispersing into the page */}
      <div className="relative w-full overflow-hidden" aria-hidden>
        <PixelHeatmap height={200} intensity={0.5} />
      </div>

      {/* app */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 py-12 sm:px-6">
        <MatchView />
      </main>

      {/* footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-8">
        <div className="hairline mb-5" />
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Foresight · powered by TxLINE live odds + events · verified on Solana mainnet
        </p>
      </footer>
    </div>
  );
}
