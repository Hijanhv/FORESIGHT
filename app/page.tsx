import { FsLockup } from "@/components/brand/logo";
import { MatchView } from "@/components/gauge/MatchView";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <FsLockup size={34} animated gradient />
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 font-mono text-[11px] tracking-wide text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-goal ping-dot" />
          Solana mainnet · live
        </span>
      </header>

      {/* hero */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-9 px-5 py-10 text-center sm:gap-11 sm:px-6 sm:py-16">
        <div className="flex flex-col items-center gap-5">
          <span
            className="rise-in font-mono text-[11px] uppercase tracking-[0.32em] text-cool"
            style={{ animationDelay: "0.05s" }}
          >
            Consumer &amp; Fan · World Cup 2026
          </span>
          <h1
            className="rise-in max-w-3xl font-display text-4xl font-semibold uppercase leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={{ animationDelay: "0.12s" }}
          >
            Feel the goal coming
            <br />
            <span
              style={{
                backgroundImage: "linear-gradient(90deg, #21E5FF, #FFC233 55%, #FF2E6E)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              before the market does.
            </span>
          </h1>
          <p
            className="rise-in max-w-xl text-base leading-7 text-muted sm:text-lg"
            style={{ animationDelay: "0.2s" }}
          >
            Pro traders know pressure surges{" "}
            <em className="not-italic text-ink">before</em>{" "}
            the odds move. Foresight turns TxLINE&rsquo;s live odds and pitch events into one
            glowing number that lights up the instant a goal is brewing — the trading-desk sixth
            sense, for every fan.
          </p>
          <div
            className="rise-in mt-1 flex flex-wrap items-center justify-center gap-2"
            style={{ animationDelay: "0.28s" }}
          >
            <span className="rounded-full border border-cool/30 bg-cool/10 px-3 py-1 font-mono text-[11px] text-cool">
              cool · market baseline
            </span>
            <span className="rounded-full border border-hot/40 bg-hot/10 px-3 py-1 font-mono text-[11px] text-hot">
              hot · 🔥 brewing
            </span>
          </div>
        </div>

        <MatchView />
      </main>

      {/* footer */}
      <footer className="mx-auto w-full max-w-5xl px-6 py-8">
        <p className="font-mono text-[11px] text-muted">
          Foresight · powered by TxLINE live odds + events · verified on Solana mainnet
        </p>
      </footer>
    </div>
  );
}
