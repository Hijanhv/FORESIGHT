import { FsLockup } from "@/components/brand/logo";
import { PixelHeatmap } from "@/components/brand/PixelHeatmap";
import { MatchView } from "@/components/gauge/MatchView";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { GetPhantomBanner } from "@/components/wallet/GetPhantomBanner";
import { InstallAppBanner } from "@/components/pwa/InstallAppBanner";

// thermal ramp (cool → hot) for the scale legend — matches the gauge + heatmap
const THERMAL = [
  "#2B5CFF", "#2E7BFF", "#22A6E0", "#3DD68C", "#7BE000", "#A6E22E", "#C8E020",
  "#FFD21F", "#FFBC1F", "#FFA01A", "#FF7A1A", "#FF5A24", "#FF3E32", "#FF2E3F",
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* nav */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <FsLockup size={30} />
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-goal ping-dot" />
            Solana mainnet · live
          </span>
          <ConnectButton />
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6"><div className="hairline" /></div>

      {/* Both show on every visit rather than once: Chrome suppresses its own
          install prompt after a dismissal, and the wallet install path must not
          be something a returning visitor can no longer find. */}
      <div className="flex flex-col gap-2 pt-4">
        <InstallAppBanner />
        <GetPhantomBanner />
      </div>

      {/* hero — editorial split: headline left, brief right */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1.5fr_1fr] md:gap-12 md:py-16">
        <div className="min-w-0">
          <p className="rise-in eyebrow" style={{ animationDelay: "0.04s" }}>
            Consumer &amp; Fan · World Cup 2026
          </p>
          <h1
            className="rise-in display-tight mt-5 text-[9.5vw] leading-[0.95] break-words sm:text-6xl sm:leading-[0.92] md:text-7xl"
            style={{ animationDelay: "0.1s" }}
          >
            Feel the goal
            <br />
            coming before
            <br />
            the market does<span className="text-hot">.</span>
          </h1>
        </div>
        <div className="flex min-w-0 flex-col justify-end gap-7">
          <p
            className="rise-in max-w-sm text-[15px] leading-6 text-muted md:text-base"
            style={{ animationDelay: "0.18s" }}
          >
            Pro traders know pressure surges{" "}
            <span className="text-ink">before</span>{" "}
            the odds move. Foresight reads TxLINE&rsquo;s live odds and pitch events, then turns that
            gap into one number. The trading-desk sixth sense, now for every fan.
          </p>
          {/* thermal scale legend — the cool→hot range the gauge runs on */}
          <div className="rise-in max-w-sm" style={{ animationDelay: "0.26s" }}>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
              <span className="text-cool">Cool · market</span>
              <span className="text-hot">🔥 Brewing</span>
            </div>
            <div className="mt-2 flex gap-[3px]">
              {THERMAL.map((c, i) => (
                <span key={i} className="h-3 flex-1" style={{ background: c }} />
              ))}
            </div>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            Foresight · powered by TxLINE live odds + events · verified on Solana mainnet
          </p>
          <a
            href="https://github.com/Hijanhv/FORESIGHT"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-hot/60 hover:text-hot sm:self-auto"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            Source on GitHub ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
