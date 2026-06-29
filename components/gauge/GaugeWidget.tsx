"use client";

import { useEffect, useState } from "react";
import type { ForesightFrame } from "@/types/foresight";
import { GamePhase } from "@/types/foresight";

const PHASE_LABEL: Record<number, string> = {
  [GamePhase.NotStarted]: "Pre-match",
  [GamePhase.FirstHalf]: "1H",
  [GamePhase.HalfTime]: "HT",
  [GamePhase.SecondHalf]: "2H",
  [GamePhase.Ended]: "FT",
  [GamePhase.Penalties]: "Pens",
  [GamePhase.EndedPens]: "FT (P)",
};

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function antColor(ant: number, brewing: boolean) {
  if (brewing) return "#F2542D";
  if (ant > 0.6) return "#F59E0B";
  return "#0EA5C4";
}

export function GaugeWidget({ fixtureId }: { fixtureId?: string } = {}) {
  const [frame, setFrame] = useState<ForesightFrame | null>(null);
  const [mode, setMode] = useState<"synthetic" | "live">("synthetic");

  useEffect(() => {
    let es: EventSource;

    const connectLive = () => {
      const url = fixtureId
        ? `/api/live?fixtureId=${encodeURIComponent(fixtureId)}`
        : "/api/live";
      es = new EventSource(url);
      es.onmessage = (e) => {
        try {
          setFrame(JSON.parse(e.data) as ForesightFrame);
          setMode("live");
        } catch {}
      };
      // 503 = env not configured → fall back to synthetic demo
      es.onerror = () => {
        es.close();
        connectSynthetic();
      };
    };

    const connectSynthetic = () => {
      es = new EventSource("/api/gauge");
      es.onmessage = (e) => {
        try {
          setFrame(JSON.parse(e.data) as ForesightFrame);
          setMode("synthetic");
        } catch {}
      };
    };

    connectLive();
    return () => es?.close();
  }, [fixtureId]);

  const ant = frame?.anticipation ?? 0;
  const brewing = frame?.brewing ?? false;
  const momentum = frame?.momentum ?? 0;
  const isLive = mode === "live";

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-line bg-surface p-8 shadow-[0_1px_2px_rgba(10,14,20,0.04),0_14px_34px_rgba(10,14,20,0.05)]">
      {/* Arc gauge */}
      <div className="relative">
        <svg
          viewBox="0 0 64 64"
          width={180}
          height={180}
          aria-label={`Anticipation: ${Math.round(ant * 100)}%`}
        >
          <defs>
            {/* Horizontal gradient: cool at left (arc start) → hot at right (arc end) */}
            <linearGradient
              id="liveArc"
              gradientUnits="userSpaceOnUse"
              x1="9"
              y1="0"
              x2="55"
              y2="0"
            >
              <stop offset="0" stopColor="#0EA5C4" />
              <stop offset="0.5" stopColor="#F59E0B" />
              <stop offset="1" stopColor="#F2542D" />
            </linearGradient>
          </defs>

          {/* Track */}
          <path
            d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
            fill="none"
            stroke="#0A0E14"
            strokeOpacity="0.1"
            strokeWidth="4.5"
            strokeLinecap="round"
          />

          {/* Live fill — pathLength="1" normalises dasharray to 0..1 */}
          <path
            d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
            fill="none"
            stroke="url(#liveArc)"
            strokeWidth="4.5"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray={`${ant.toFixed(4)} 2`}
            style={{ transition: "stroke-dasharray 0.4s ease" }}
            className={brewing ? "animate-pulse" : undefined}
          />
        </svg>

        {/* Centre overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-8">
          <span
            className="font-display text-4xl font-bold tabular-nums"
            style={{
              color: antColor(ant, brewing),
              transition: "color 0.4s ease",
            }}
          >
            {Math.round(ant * 100)}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-widest"
            style={{ color: antColor(ant, brewing) }}
          >
            {brewing ? "🔥 brewing" : "anticipation"}
          </span>
        </div>
      </div>

      {/* Score & clock */}
      <div className="text-center">
        <div className="font-display text-3xl font-medium tabular-nums text-ink">
          {frame ? `${frame.homeScore} – ${frame.awayScore}` : "— – —"}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted">
          {frame
            ? `${clock(frame.clockSeconds)} · ${PHASE_LABEL[frame.phase] ?? "—"}`
            : "connecting…"}
        </div>
      </div>

      {/* Momentum bar */}
      <div className="w-full space-y-1.5">
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
          <span>away</span>
          <span>momentum</span>
          <span>home</span>
        </div>
        <div className="relative h-1 overflow-hidden rounded-full bg-line">
          {/* Filled segment — extends from centre toward the pressuring side */}
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              left:
                momentum >= 0
                  ? "50%"
                  : `${(0.5 + momentum / 2) * 100}%`,
              width: `${(Math.abs(momentum) / 2) * 100}%`,
              backgroundColor: "#F2542D",
              transition: "left 0.4s ease, width 0.4s ease",
            }}
          />
          {/* Centre marker */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-line" />
        </div>
      </div>

      {/* Probability bars */}
      {frame && (
        <div className="w-full space-y-2">
          {(
            [
              { label: "HOME", prob: frame.homeProb, color: "#0EA5C4" },
              { label: "DRAW", prob: frame.drawProb, color: "#6b7686" },
              { label: "AWAY", prob: frame.awayProb, color: "#F2542D" },
            ] as const
          ).map(({ label, prob, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-10 font-mono text-[10px] text-muted">
                {label}
              </span>
              <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${prob * 100}%`,
                    backgroundColor: color,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <span className="w-8 text-right font-mono text-[10px] tabular-nums text-ink">
                {Math.round(prob * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Data source badge */}
      <div className="pt-1">
        <span
          className={`rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-wider ${
            isLive
              ? "border-hot/30 bg-hot/5 text-hot"
              : "border-line text-muted"
          }`}
        >
          {isLive ? "● live · TxLINE" : "◎ synthetic demo"}
        </span>
      </div>
    </div>
  );
}
