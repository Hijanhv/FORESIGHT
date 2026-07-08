import type { MatchStats as Stats } from "@/types/foresight";

// Home = cool, Away = hot — consistent with the gauge's probability bars.
const HOME = "#0EA5C4";
const AWAY = "#F2542D";

function StatRow({ label, home, away }: { label: string; home: number; away: number }) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  const leader = home > away ? "home" : away > home ? "away" : "none";

  return (
    <div className="w-full">
      <div className="flex items-center justify-between font-mono text-[11px]">
        <span
          className={`w-8 tabular-nums ${leader === "home" ? "font-bold text-cool" : "text-ink"}`}
        >
          {home}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
        <span
          className={`w-8 text-right tabular-nums ${leader === "away" ? "font-bold text-hot" : "text-ink"}`}
        >
          {away}
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          style={{
            width: `${homePct}%`,
            backgroundColor: total > 0 ? HOME : "transparent",
            transition: "width 0.4s ease",
          }}
        />
        <div
          style={{
            width: `${100 - homePct}%`,
            backgroundColor: total > 0 ? AWAY : "transparent",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Live match-stats panel — the real per-side numbers from the TxLINE scores feed
 * (corners + cards; the only team stats the feed carries). Goals are shown as the
 * scoreline in the gauge above.
 */
export function MatchStats({
  stats,
  homeTeam = "HOME",
  awayTeam = "AWAY",
}: {
  stats: Stats;
  homeTeam?: string;
  awayTeam?: string;
}) {
  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-3xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(10,14,20,0.04),0_14px_34px_rgba(10,14,20,0.05)]">
      <div className="flex items-center justify-between gap-2">
        <span className="max-w-[35%] truncate font-mono text-[11px] font-medium text-cool">
          {homeTeam}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
          Match Stats
        </span>
        <span className="max-w-[35%] truncate text-right font-mono text-[11px] font-medium text-hot">
          {awayTeam}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <StatRow label="Corners" home={stats.homeCorners} away={stats.awayCorners} />
        <StatRow label="Yellow Cards" home={stats.homeYellows} away={stats.awayYellows} />
        <StatRow label="Red Cards" home={stats.homeReds} away={stats.awayReds} />
      </div>

      <div className="pt-1 text-center font-mono text-[9px] text-muted">
        live · verifiable on-chain via TxLINE
      </div>
    </div>
  );
}
