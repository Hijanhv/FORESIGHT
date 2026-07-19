"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ForesightFrame, PitchEvent } from "@/types/foresight";
import { GamePhase } from "@/types/foresight";
import { MatchStats } from "./MatchStats";

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
  if (brewing) return "#FF2E6E";
  if (ant > 0.6) return "#FFC233";
  return "#21E5FF";
}

// Smoothly count a displayed value toward its target (rAF eased).
function useCountUp(target: number, ms = 550) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - p) * (1 - p);
      const nv = from + (target - from) * e;
      cur.current = nv;
      setV(nv);
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return v;
}

const EVENT_CONFIG: Record<
  PitchEvent["kind"],
  { label: string; icon: string; color: string; ring: string }
> = {
  goal:   { label: "GOAL",        icon: "⚽", color: "#37FFB4", ring: "rgba(55,255,180,0.5)" },
  yellow: { label: "YELLOW",      icon: "🟨", color: "#FFC233", ring: "rgba(255,194,51,0.5)" },
  red:    { label: "RED CARD",    icon: "🟥", color: "#FF3B3B", ring: "rgba(255,59,59,0.55)" },
  corner: { label: "CORNER",      icon: "⚑", color: "#21E5FF", ring: "rgba(33,229,255,0.45)" },
};

type SignalKind = PitchEvent["kind"] | "brewing" | "odds";
interface Signal {
  id: number;
  kind: SignalKind;
  side?: "home" | "away";
  text: string;
  detail?: string;
  color: string;
}

export function GaugeWidget({
  fixtureId,
  homeTeam = "HOME",
  awayTeam = "AWAY",
  forceDemo = false,
}: { fixtureId?: string; homeTeam?: string; awayTeam?: string; forceDemo?: boolean } = {}) {
  const [frame, setFrame] = useState<ForesightFrame | null>(null);
  const [mode, setMode] = useState<"synthetic" | "live">("synthetic");
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveMeta, setLiveMeta] = useState<{ home?: string; away?: string; competition?: string } | null>(null);
  const [flash, setFlash] = useState<PitchEvent | null>(null);
  const [feed, setFeed] = useState<Signal[]>([]);
  const [calling, setCalling] = useState(false);
  const [receipt, setReceipt] = useState<{ txSig: string; explorerUrl: string } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{ deltaSec: number } | null>(null);
  const [muted, setMuted] = useState(true);

  const lastSeenSeq = useRef<number | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasBrewing = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const signalId = useRef(0);
  const lastOdds = useRef<{ prob: number; at: number } | null>(null);
  const calledAt = useRef<{ clock: number; total: number } | null>(null);
  const mutedRef = useRef(true);

  const pushSignal = (s: Omit<Signal, "id">) => {
    setFeed((f) => [{ ...s, id: signalId.current++ }, ...f].slice(0, 6));
  };

  // ── SSE pipeline (unchanged): prefer live TxLINE, fall back to scripted demo ──
  useEffect(() => {
    let liveEs: EventSource | null = null;
    let synthEs: EventSource | null = null;
    let gotLiveFrame = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const openSynthetic = () => {
      if (synthEs || gotLiveFrame) return;
      synthEs = new EventSource("/api/gauge");
      synthEs.onmessage = (e) => {
        if (gotLiveFrame) return;
        try {
          setFrame(JSON.parse(e.data) as ForesightFrame);
          setMode("synthetic");
        } catch {}
      };
    };

    const openLive = () => {
      const url = fixtureId
        ? `/api/live?fixtureId=${encodeURIComponent(fixtureId)}`
        : "/api/live";
      liveEs = new EventSource(url);

      liveEs.addEventListener("connected", (e) => {
        setLiveConnected(true);
        try {
          const meta = JSON.parse((e as MessageEvent).data) as {
            home?: string; away?: string; competition?: string;
          };
          if (meta && (meta.home || meta.away)) setLiveMeta(meta);
        } catch {}
      });

      liveEs.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ForesightFrame;
          if ("error" in data) return;
          gotLiveFrame = true;
          synthEs?.close();
          synthEs = null;
          // setFrame only — the frame-derivation effect owns flash/feed/alerts.
          setFrame(data);
          setMode("live");
        } catch {}
      };

      liveEs.onerror = () => openSynthetic();
    };

    gotLiveFrame = false;
    // reset per-connection derived refs (state is reset in cleanup, below)
    lastOdds.current = null;
    calledAt.current = null;
    lastSeenSeq.current = undefined;
    wasBrewing.current = false;

    if (forceDemo) {
      openSynthetic();
    } else {
      openLive();
      fallbackTimer = setTimeout(() => {
        if (!gotLiveFrame) openSynthetic();
      }, 6000);
    }

    return () => {
      setLiveConnected(false);
      setLiveMeta(null);
      setFeed([]);
      setVerdict(null);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      liveEs?.close();
      synthEs?.close();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [fixtureId, forceDemo]);

  const ant = frame?.anticipation ?? 0;
  const brewing = frame?.brewing ?? false;
  const momentum = frame?.momentum ?? 0;
  const isLive = mode === "live";
  const shownAnt = useCountUp(Math.round(ant * 100));

  const homeLabel = liveMeta?.home ?? homeTeam;
  const awayLabel = liveMeta?.away ?? awayTeam;
  const twoWay = frame ? frame.drawProb < 0.005 : false;
  const marketProb = frame ? Math.max(frame.homeProb, frame.awayProb) : 0;

  // Alert tone + haptic per signal kind (opt-in; unlocked by the bell toggle).
  const playAlert = (kind: SignalKind) => {
    if (mutedRef.current) return;
    const ctx = audioRef.current;
    const patterns: Record<SignalKind, number[]> = {
      brewing: [40, 30, 60], goal: [60, 40, 120], red: [120, 60, 120],
      yellow: [40], corner: [15], odds: [20],
    };
    navigator.vibrate?.(patterns[kind] ?? 20);
    if (!ctx) return;
    const beep = (f0: number, f1: number, dur: number, type: OscillatorType, gain = 0.13, delay = 0) => {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    };
    if (kind === "brewing") beep(660, 990, 0.32, "sine");
    else if (kind === "goal") { beep(523, 660, 0.16, "triangle", 0.16); beep(784, 988, 0.4, "triangle", 0.16, 0.14); }
    else if (kind === "red") beep(220, 130, 0.4, "sawtooth", 0.12);
    else if (kind === "yellow") beep(440, 440, 0.14, "square", 0.08);
    else if (kind === "odds") beep(880, 1100, 0.12, "sine", 0.07);
  };

  // Derive signals from each frame: events, brewing onset, and odds shifts.
  useEffect(() => {
    if (!frame) return;
    // 1) pitch event (goal / card / corner)
    const ev = frame.lastEvent;
    if (ev && ev.seq !== lastSeenSeq.current) {
      lastSeenSeq.current = ev.seq;
      setFlash(ev);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 3500);
      const cfg = EVENT_CONFIG[ev.kind];
      const who = ev.side === "home" ? homeLabel : awayLabel;
      pushSignal({ kind: ev.kind, side: ev.side, color: cfg.color, text: `${cfg.icon} ${cfg.label} · ${who}`, detail: clock(ev.clockSeconds) });
      playAlert(ev.kind);
      // "Called It" verdict — did a goal follow the read?
      if (ev.kind === "goal" && calledAt.current) {
        const delta = Math.max(0, ev.clockSeconds - calledAt.current.clock);
        setVerdict({ deltaSec: delta });
        calledAt.current = null;
      }
    }
    // 2) brewing onset
    if (brewing && !wasBrewing.current) {
      pushSignal({ kind: "brewing", color: "#FF2E6E", text: "🔥 GOAL BREWING", detail: `${Math.round(ant * 100)} vs mkt ${Math.round(marketProb * 100)}` });
      playAlert("brewing");
    }
    wasBrewing.current = brewing;
    // 3) odds shift (>= 6pp move on the leading side, throttled 4s)
    const now = Date.now();
    const prev = lastOdds.current;
    if (prev == null) {
      lastOdds.current = { prob: marketProb, at: now };
    } else if (Math.abs(marketProb - prev.prob) >= 0.06 && now - prev.at > 4000) {
      const up = marketProb > prev.prob;
      pushSignal({ kind: "odds", color: "#8B95FF", text: `📈 ODDS ${up ? "SHIFT ↑" : "SHIFT ↓"}`, detail: `${Math.round(prev.prob * 100)}→${Math.round(marketProb * 100)}%` });
      playAlert("odds");
      lastOdds.current = { prob: marketProb, at: now };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const toggleAlerts = () => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (!next && !audioRef.current) {
        try {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioRef.current = new AC();
        } catch {}
      }
      audioRef.current?.resume?.();
      if (!next) navigator.vibrate?.(20);
      return next;
    });
  };

  const handleCallIt = async () => {
    if (!frame || calling) return;
    setCalling(true);
    setCallError(null);
    setVerdict(null);
    calledAt.current = { clock: frame.clockSeconds, total: frame.homeScore + frame.awayScore };
    try {
      const res = await fetch("/api/called-it", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: frame.fixtureId,
          home: homeLabel,
          away: awayLabel,
          clockSeconds: frame.clockSeconds,
          anticipation: frame.anticipation,
          marketProb,
          homeScore: frame.homeScore,
          awayScore: frame.awayScore,
        }),
      });
      const data = (await res.json()) as { txSig?: string; explorerUrl?: string; error?: string };
      if (!res.ok || !data.txSig) throw new Error(data.error ?? "Failed to record on-chain");
      setReceipt({ txSig: data.txSig, explorerUrl: data.explorerUrl ?? "" });
    } catch (err) {
      setCallError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalling(false);
    }
  };

  // Ember particles (only rendered while brewing) — random but stable.
  const embers = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      left: 8 + (i * 7.3) % 84,
      delay: (i * 0.37) % 2.4,
      dur: 2 + ((i * 13) % 10) / 10,
      size: 2 + (i % 3),
    })),
    [],
  );

  return (
    <>
      {brewing && <div className="brewing-vignette" aria-hidden />}

      <div
        data-shot="gauge"
        className={`relative flex w-full max-w-md flex-col items-center gap-6 rounded-3xl p-6 glass sm:p-7 ${
          brewing ? "brewing-ring" : ""
        }`}
      >
        {/* rising embers */}
        {brewing && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 top-24 overflow-hidden" aria-hidden>
            {embers.map((e, i) => (
              <span
                key={i}
                className="absolute bottom-0 rounded-full"
                style={{
                  left: `${e.left}%`,
                  width: e.size, height: e.size,
                  background: "#FF2E6E",
                  boxShadow: "0 0 6px 1px rgba(255,46,110,0.8)",
                  animation: `ember ${e.dur}s ease-out ${e.delay}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        {/* Header: competition + alerts */}
        <div className="flex w-full items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {liveMeta?.competition ?? (isLive ? "Live" : "Demo match")}
          </span>
          <button
            type="button"
            onClick={toggleAlerts}
            aria-label={muted ? "Enable goal alerts (sound + vibration)" : "Mute goal alerts"}
            aria-pressed={!muted}
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              muted ? "border-line text-muted hover:text-ink" : "border-hot/50 bg-hot/10 text-hot"
            }`}
          >
            {muted ? "🔕 alerts" : "🔔 alerts on"}
          </button>
        </div>

        {/* Arc gauge — the glowing hero */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 rounded-full blur-2xl transition-opacity duration-500"
            style={{
              background: `radial-gradient(circle, ${antColor(ant, brewing)}${brewing ? "66" : "3a"}, transparent 70%)`,
            }}
            aria-hidden
          />
          <svg viewBox="0 0 64 64" width={196} height={196} aria-label={`Anticipation: ${Math.round(ant * 100)}%`}>
            <defs>
              <linearGradient id="liveArc" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="55" y2="0">
                <stop offset="0" stopColor="#21E5FF" />
                <stop offset="0.5" stopColor="#FFC233" />
                <stop offset="1" stopColor="#FF2E6E" />
              </linearGradient>
            </defs>

            {/* Track */}
            <path
              d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
              fill="none"
              stroke="#21E5FF"
              strokeOpacity="0.12"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Live fill */}
            <path
              d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
              fill="none"
              stroke="url(#liveArc)"
              strokeWidth="4.5"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${ant.toFixed(4)} 2`}
              style={{
                transition: "stroke-dasharray 0.5s ease",
                filter: brewing
                  ? "drop-shadow(0 0 5px rgba(255,46,110,0.95)) drop-shadow(0 0 12px rgba(255,46,110,0.55))"
                  : `drop-shadow(0 0 5px rgba(33,229,255,${(0.3 + ant * 0.5).toFixed(2)}))`,
              }}
            />
          </svg>

          {/* Centre overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-9">
            <span
              className="font-display text-5xl font-bold tabular-nums leading-none"
              style={{ color: antColor(ant, brewing), transition: "color 0.4s ease", textShadow: `0 0 22px ${antColor(ant, brewing)}55` }}
            >
              {Math.round(shownAnt)}
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: antColor(ant, brewing) }}>
              {brewing ? "🔥 brewing" : "anticipation"}
            </span>
            {frame && (
              <span className="mt-0.5 font-mono text-[9px] tracking-wide text-muted">
                market {Math.round(marketProb * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Big event flash */}
        <div className="flex h-7 items-center justify-center">
          {flash && (() => {
            const cfg = EVENT_CONFIG[flash.kind];
            return (
              <span
                key={flash.seq}
                className="flash-pop flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
                style={{ color: cfg.color, borderColor: cfg.ring, background: `${cfg.color}18`, boxShadow: `0 0 20px -4px ${cfg.ring}` }}
              >
                {cfg.icon} {cfg.label} · {flash.side === "home" ? homeLabel : awayLabel} · {clock(flash.clockSeconds)}
              </span>
            );
          })()}
        </div>

        {/* "Called It" verdict — the payoff when the read lands */}
        {verdict && (
          <div className="flash-pop w-full rounded-2xl border border-goal/40 bg-goal/10 px-4 py-3 text-center" style={{ boxShadow: "0 0 34px -8px rgba(55,255,180,0.5)" }}>
            <div className="font-display text-sm font-semibold uppercase tracking-wide text-goal">
              ✓ You called it
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              the goal came {verdict.deltaSec > 0 ? `${verdict.deltaSec}s` : "moments"} after your read — before the market moved
            </div>
          </div>
        )}

        {/* "Called It" CTA + receipt */}
        {frame && !receipt && (
          <button
            onClick={handleCallIt}
            disabled={calling}
            className={`relative w-full rounded-2xl border px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wider transition-all disabled:opacity-60 ${
              brewing ? "shimmer border-hot/50 bg-hot/15 text-hot" : "border-line text-muted hover:border-hot/40 hover:text-hot"
            }`}
            style={brewing ? { boxShadow: "0 0 28px -6px rgba(255,46,110,0.6)" } : undefined}
          >
            {calling ? "recording on Solana…" : brewing ? "🔥 Call it — I feel a goal coming" : "Call it — record your read on-chain"}
          </button>
        )}

        {receipt && (
          <div className="w-full rounded-2xl border border-hot/40 bg-hot/10 px-4 py-3 text-center" style={{ boxShadow: "0 0 30px -10px rgba(255,46,110,0.5)" }}>
            <div className="font-display text-[12px] font-semibold uppercase tracking-wider text-hot">
              ✓ Called it — recorded on Solana
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted break-all">
              {receipt.txSig.slice(0, 8)}…{receipt.txSig.slice(-8)}
            </div>
            <div className="mt-2 flex items-center justify-center gap-3">
              <a href={receipt.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-cool underline decoration-dotted hover:text-hot">
                view on Solscan ↗
              </a>
              <button onClick={() => { navigator.clipboard?.writeText(receipt.explorerUrl).catch(() => {}); }} className="font-mono text-[10px] text-muted underline decoration-dotted hover:text-ink">
                copy link
              </button>
              <button onClick={() => { setReceipt(null); setVerdict(null); }} className="font-mono text-[10px] text-muted underline decoration-dotted hover:text-ink">
                call again
              </button>
            </div>
          </div>
        )}
        {callError && <div className="w-full text-center font-mono text-[10px] text-hot">{callError}</div>}

        {/* Score & clock */}
        <div className="text-center">
          <div className="font-display text-4xl font-semibold tabular-nums text-ink" style={{ textShadow: "0 0 24px rgba(33,229,255,0.18)" }}>
            {frame ? `${frame.homeScore} – ${frame.awayScore}` : "— – —"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {frame
              ? `${clock(frame.clockSeconds)} · ${PHASE_LABEL[frame.phase] ?? "—"}`
              : liveConnected ? "pre-match · waiting for kickoff" : "connecting…"}
          </div>
        </div>

        {/* Momentum bar */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
            <span>{awayLabel}</span>
            <span>momentum</span>
            <span>{homeLabel}</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute top-0 h-full rounded-full"
              style={{
                left: momentum >= 0 ? "50%" : `${(0.5 + momentum / 2) * 100}%`,
                width: `${(Math.abs(momentum) / 2) * 100}%`,
                background: momentum >= 0 ? "#FF2E6E" : "#21E5FF",
                boxShadow: `0 0 10px ${momentum >= 0 ? "rgba(255,46,110,0.6)" : "rgba(33,229,255,0.6)"}`,
                transition: "left 0.4s ease, width 0.4s ease, background 0.4s ease",
              }}
            />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/20" />
          </div>
        </div>

        {/* Market win-probability bars */}
        {frame && (
          <div className="w-full space-y-2">
            <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
              <span>market win prob</span>
              <span>{twoWay ? "draw-no-bet" : "1X2"}</span>
            </div>
            {(twoWay
              ? [
                  { label: homeLabel, prob: frame.homeProb, color: "#21E5FF" },
                  { label: awayLabel, prob: frame.awayProb, color: "#FF2E6E" },
                ]
              : [
                  { label: homeLabel, prob: frame.homeProb, color: "#21E5FF" },
                  { label: "DRAW", prob: frame.drawProb, color: "#7f8ca6" },
                  { label: awayLabel, prob: frame.awayProb, color: "#FF2E6E" },
                ]
            ).map(({ label, prob, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-14 truncate font-mono text-[10px] text-muted">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${prob * 100}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}80`, transition: "width 0.4s ease" }} />
                </div>
                <span className="w-8 text-right font-mono text-[10px] tabular-nums text-ink">{Math.round(prob * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Data source badge */}
        <div className="pt-1">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-wider ${
              isLive ? "border-hot/40 bg-hot/10 text-hot" : "border-line text-muted"
            }`}
          >
            {isLive ? <span className="h-1.5 w-1.5 rounded-full bg-hot ping-dot" /> : "◎"}
            {isLive ? "live · TxLINE" : "synthetic demo"}
          </span>
        </div>
      </div>

      {/* Live Signal Feed — every goal, card & odds shift, the instant it happens */}
      {feed.length > 0 && (
        <div data-shot="feed" className="mt-4 w-full max-w-md rounded-3xl p-5 glass">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Live signal feed</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">goals · cards · odds</span>
          </div>
          <div className="flex flex-col gap-2">
            {feed.map((s) => (
              <div key={s.id} className="signal-in flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                <span className="flex-1 truncate font-mono text-[11px]" style={{ color: s.color }}>{s.text}</span>
                {s.detail && <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted">{s.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live match-stats panel */}
      {frame && (
        <MatchStats
          stats={frame.stats}
          homeTeam={homeLabel}
          awayTeam={awayLabel}
          fixtureId={frame.fixtureId}
          lastEvent={frame.lastEvent}
          live={isLive}
        />
      )}
    </>
  );
}
