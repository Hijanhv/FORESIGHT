"use client";

import { useEffect, useRef, useState } from "react";
import type { ForesightFrame, PitchEvent } from "@/types/foresight";
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

const EVENT_CONFIG: Record<PitchEvent["kind"], { label: string; bg: string; text: string; icon: string }> = {
  goal:   { label: "GOAL",        bg: "bg-amber-400/20 border-amber-400/40",  text: "text-amber-500", icon: "⚽" },
  yellow: { label: "YELLOW CARD", bg: "bg-yellow-300/20 border-yellow-400/40", text: "text-yellow-500", icon: "🟨" },
  red:    { label: "RED CARD",    bg: "bg-red-500/20 border-red-500/40",       text: "text-red-500",    icon: "🟥" },
  corner: { label: "CORNER",      bg: "bg-cool/10 border-cool/30",             text: "text-cool",       icon: "⚑" },
};

export function GaugeWidget({
  fixtureId,
  homeTeam = "HOME",
  awayTeam = "AWAY",
}: { fixtureId?: string; homeTeam?: string; awayTeam?: string } = {}) {
  const [frame, setFrame] = useState<ForesightFrame | null>(null);
  const [mode, setMode] = useState<"synthetic" | "live">("synthetic");
  const [liveConnected, setLiveConnected] = useState(false);
  const [flash, setFlash] = useState<PitchEvent | null>(null);
  const lastSeenSeq = useRef<number | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource;
    let syntheticFallback = false;

    const connectLive = () => {
      const url = fixtureId
        ? `/api/live?fixtureId=${encodeURIComponent(fixtureId)}`
        : "/api/live";
      es = new EventSource(url);

      // Switch badge to live as soon as streams are established.
      es.addEventListener("connected", () => {
        setMode("live");
        setLiveConnected(true);
        syntheticFallback = false;
      });

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ForesightFrame;
          if ("error" in data) return;
          setFrame(data);
          setMode("live");
          if (data.lastEvent && data.lastEvent.seq !== lastSeenSeq.current) {
            lastSeenSeq.current = data.lastEvent.seq;
            setFlash(data.lastEvent);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlash(null), 3500);
          }
        } catch {}
      };

      // Only fall back to synthetic if we never connected (503 / network error).
      es.onerror = () => {
        if (!syntheticFallback && !liveConnected) {
          es.close();
          syntheticFallback = true;
          connectSynthetic();
        }
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

    setLiveConnected(false);
    connectLive();
    return () => {
      es?.close();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
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

      {/* Event flash */}
      <div className="h-7 flex items-center justify-center">
        {flash && (() => {
          const cfg = EVENT_CONFIG[flash.kind];
          return (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider animate-pulse ${cfg.bg} ${cfg.text}`}
              style={{ animationDuration: "0.6s" }}
            >
              {cfg.icon} {cfg.label} · {flash.side === "home" ? homeTeam : awayTeam} · {clock(flash.clockSeconds)}
            </span>
          );
        })()}
      </div>

      {/* Score & clock */}
      <div className="text-center">
        <div className="font-display text-3xl font-medium tabular-nums text-ink">
          {frame ? `${frame.homeScore} – ${frame.awayScore}` : "— – —"}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted">
          {frame
            ? `${clock(frame.clockSeconds)} · ${PHASE_LABEL[frame.phase] ?? "—"}`
            : liveConnected
              ? "pre-match · waiting for kickoff"
              : "connecting…"}
        </div>
      </div>

      {/* Momentum bar */}
      <div className="w-full space-y-1.5">
        <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
          <span>{awayTeam}</span>
          <span>momentum</span>
          <span>{homeTeam}</span>
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
              { label: homeTeam, prob: frame.homeProb, color: "#0EA5C4" },
              { label: "DRAW",   prob: frame.drawProb, color: "#6b7686" },
              { label: awayTeam, prob: frame.awayProb, color: "#F2542D" },
            ]
          ).map(({ label, prob, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-14 font-mono text-[10px] text-muted truncate">
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
