import { FsLockup, FsMark } from "@/components/brand/logo";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <FsLockup size={34} />
        <span className="rounded-full border border-line px-3 py-1 font-mono text-[11px] tracking-wide text-muted">
          devnet · build v0
        </span>
      </header>

      {/* hero */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            Consumer &amp; Fan Experiences
          </span>
          <h1 className="max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Feel a goal coming{" "}
            <span className="text-hot">before it happens.</span>
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted">
            Foresight turns live odds and events into an anticipation engine — it
            lights up when on-pitch pressure surges but the market has not
            repriced yet. The trading desk sixth sense, for every fan.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-cool/30 bg-cool/5 px-3 py-1 font-mono text-[11px] text-cool">
              cool = market baseline
            </span>
            <span className="rounded-full border border-hot/30 bg-hot/5 px-3 py-1 font-mono text-[11px] text-hot">
              hot = 🔥 brewing
            </span>
          </div>
        </div>

        {/* gauge placeholder — the real one lands in Phase 4 */}
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border border-line bg-surface p-10 shadow-[0_1px_2px_rgba(10,14,20,0.04),0_14px_34px_rgba(10,14,20,0.05)]">
          <FsMark size={120} />
          <div className="text-center">
            <div className="font-display text-sm font-medium text-ink">
              The live gauge lands in Phase 4
            </div>
            <div className="mt-1 font-mono text-[11px] text-muted">
              foundation online · engine + UX next
            </div>
          </div>
        </div>
      </main>

      {/* footer */}
      <footer className="mx-auto w-full max-w-5xl px-6 py-8">
        <p className="font-mono text-[11px] text-muted">
          Foresight · powered by TxLINE live odds + events · Solana devnet
        </p>
      </footer>
    </div>
  );
}
