"use client";

import { useState } from "react";
import type { MatchStats as Stats, PitchEvent } from "@/types/foresight";

// Home = cool, Away = hot — consistent with the gauge's probability bars.
const HOME = "#0EA5C4";
const AWAY = "#F2542D";

// PitchEvent kind + side → TxLINE StatKey, so we can ask for its on-chain proof.
const STAT_KEY: Record<PitchEvent["kind"], { home: number; away: number }> = {
  goal: { home: 1, away: 2 },
  yellow: { home: 3, away: 4 },
  red: { home: 5, away: 6 },
  corner: { home: 7, away: 8 },
};

interface VerifyResult {
  anchored: boolean;
  value?: number;
  eventStatRoot?: string;
  proofDepth?: number;
  updateCount?: number;
  program?: string;
  error?: string;
}

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
  fixtureId,
  lastEvent,
  live = false,
}: {
  stats: Stats;
  homeTeam?: string;
  awayTeam?: string;
  fixtureId?: string;
  lastEvent?: PitchEvent | null;
  live?: boolean;
}) {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const canVerify = live && !!fixtureId && !!lastEvent;

  const verify = async () => {
    if (!fixtureId || !lastEvent || verifying) return;
    setVerifying(true);
    setResult(null);
    try {
      const statKey = STAT_KEY[lastEvent.kind][lastEvent.side];
      const res = await fetch(
        `/api/verify-stat?fixtureId=${encodeURIComponent(fixtureId)}&seq=${lastEvent.seq}&statKey=${statKey}`,
      );
      setResult((await res.json()) as VerifyResult);
    } catch (err) {
      setResult({ anchored: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setVerifying(false);
    }
  };

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

      {/* Verified on Solana — surface TxLINE's Merkle proof that the data is
          anchored on-chain (the hackathon thesis, made tappable). */}
      {canVerify ? (
        <div className="border-t border-line pt-3">
          {!result && (
            <button
              onClick={verify}
              disabled={verifying}
              className="w-full font-mono text-[10px] uppercase tracking-wider text-cool underline decoration-dotted transition-colors hover:text-hot disabled:opacity-60"
            >
              {verifying ? "checking Solana…" : "✓ Verify latest stat on Solana"}
            </button>
          )}
          {result?.anchored && (
            <div className="space-y-1 text-center">
              <div className="font-mono text-[10px] uppercase tracking-wider text-cool">
                ✓ Verified on Solana
              </div>
              <div className="font-mono text-[9px] text-muted break-all">
                root {result.eventStatRoot?.slice(0, 8)}…{result.eventStatRoot?.slice(-8)} ·{" "}
                {result.proofDepth}-node Merkle proof · {result.updateCount} anchored updates
              </div>
              <a
                href={`https://solscan.io/account/${result.program}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[9px] text-cool underline decoration-dotted hover:text-hot"
              >
                daily-scores root program ↗
              </a>
            </div>
          )}
          {result && !result.anchored && (
            <div className="text-center font-mono text-[9px] text-muted">
              anchoring… stats are batched into the on-chain root hourly
            </div>
          )}
        </div>
      ) : (
        <div className="pt-1 text-center font-mono text-[9px] text-muted">
          live · every stat verifiable on-chain via TxLINE
        </div>
      )}
    </div>
  );
}
