"use client";

import { useEffect, useRef, useState } from "react";
import type { ForesightFrame, PitchEvent } from "@/types/foresight";
import { GamePhase } from "@/types/foresight";
import { useWallet } from "@/components/wallet/WalletProvider";
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

// thermal palette (light theme)
const COOL = "#2B5CFF";
const MID = "#FFBC1F";
const HOT = "#FF2E3F";
const GOAL = "#12B76A";

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function antColor(ant: number, brewing: boolean) {
  if (brewing) return HOT;
  if (ant > 0.6) return MID;
  return COOL;
}

/**
 * Renders the eased count-up in its own component so the per-frame setState
 * stays local. Held in the parent it re-rendered the entire widget — feed,
 * market bars and <MatchStats> included — on every animation frame, which on a
 * throttled phone measured ~59 DOM mutations/sec of pure churn.
 */
function CountUpValue({
  target,
  className,
  style,
}: {
  target: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const v = useCountUp(target);
  return (
    <span className={className} style={style}>
      {Math.round(v)}
    </span>
  );
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
  { label: string; icon: string; color: string }
> = {
  goal:   { label: "GOAL",     icon: "⚽", color: GOAL },
  yellow: { label: "YELLOW",   icon: "🟨", color: MID },
  red:    { label: "RED CARD", icon: "🟥", color: HOT },
  corner: { label: "CORNER",   icon: "⚑", color: COOL },
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
  ready = true,
}: {
  fixtureId?: string;
  homeTeam?: string;
  awayTeam?: string;
  forceDemo?: boolean;
  /** Gate the stream while the caller is still resolving which fixture to show. */
  ready?: boolean;
} = {}) {
  const [frame, setFrame] = useState<ForesightFrame | null>(null);
  const [mode, setMode] = useState<"synthetic" | "live">("synthetic");
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveMeta, setLiveMeta] = useState<{ home?: string; away?: string; competition?: string } | null>(null);
  const [flash, setFlash] = useState<PitchEvent | null>(null);
  const [feed, setFeed] = useState<Signal[]>([]);
  const [calling, setCalling] = useState(false);
  const [receipt, setReceipt] = useState<{ txSig: string; explorerUrl: string; calledByShort?: string } | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const { wallet, connecting, signIn } = useWallet();
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

  // ── SSE pipeline: prefer live TxLINE, fall back to scripted demo ──
  useEffect(() => {
    if (!ready) return;
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
  }, [fixtureId, forceDemo, ready]);

  const ant = frame?.anticipation ?? 0;
  const brewing = frame?.brewing ?? false;
  const momentum = frame?.momentum ?? 0;
  const isLive = mode === "live";

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
      if (ev.kind === "goal" && calledAt.current) {
        const delta = Math.max(0, ev.clockSeconds - calledAt.current.clock);
        setVerdict({ deltaSec: delta });
        calledAt.current = null;
      }
    }
    if (brewing && !wasBrewing.current) {
      pushSignal({ kind: "brewing", color: HOT, text: "🔥 GOAL BREWING", detail: `${Math.round(ant * 100)} vs mkt ${Math.round(marketProb * 100)}` });
      playAlert("brewing");
    }
    wasBrewing.current = brewing;
    const now = Date.now();
    const prev = lastOdds.current;
    if (prev == null) {
      lastOdds.current = { prob: marketProb, at: now };
    } else if (Math.abs(marketProb - prev.prob) >= 0.06 && now - prev.at > 4000) {
      const up = marketProb > prev.prob;
      pushSignal({ kind: "odds", color: "#6C5CE7", text: `📈 ODDS ${up ? "SHIFT ↑" : "SHIFT ↓"}`, detail: `${Math.round(prev.prob * 100)}→${Math.round(marketProb * 100)}%` });
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
    if (!frame || calling || connecting) return;
    setCallError(null);

    // Attribution first: the fan proves wallet ownership (free signature) so
    // their address lands in the on-chain receipt. One tap does both.
    let signer = wallet;
    if (!signer) {
      setCalling(true);
      signer = await signIn();
      setCalling(false);
      if (!signer) {
        setCallError("Connect your Solana wallet to call it.");
        return;
      }
    }

    setCalling(true);
    setVerdict(null);
    calledAt.current = { clock: frame.clockSeconds, total: frame.homeScore + frame.awayScore };

    const post = () =>
      fetch("/api/called-it", {
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

    try {
      let res = await post();
      // Session expired server-side while the UI still shows connected —
      // re-establish it once and retry so the tap doesn't dead-end.
      if (res.status === 401) {
        const re = await signIn();
        if (!re) throw new Error("Connect your Solana wallet to call it.");
        res = await post();
      }
      const data = (await res.json()) as {
        txSig?: string;
        explorerUrl?: string;
        calledByShort?: string;
        error?: string;
      };
      if (!res.ok || !data.txSig) throw new Error(data.error ?? "Failed to record on-chain");
      setReceipt({ txSig: data.txSig, explorerUrl: data.explorerUrl ?? "", calledByShort: data.calledByShort });
    } catch (err) {
      setCallError(err instanceof Error ? err.message : String(err));
    } finally {
      setCalling(false);
    }
  };

  return (
    <>
      {brewing && <div className="brewing-vignette" aria-hidden />}

      <div
        data-shot="gauge"
        className={`relative flex w-full max-w-md flex-col items-center gap-5 rounded-2xl p-6 card sm:p-7 ${
          brewing ? "brewing-ring" : ""
        }`}
      >
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

        {/* Arc gauge — viewBox cropped below the arc so there's no empty cup */}
        <div className="relative">
          <svg viewBox="0 0 64 55" width={200} height={172} aria-label={`Anticipation: ${Math.round(ant * 100)}%`}>
            <defs>
              <linearGradient id="liveArc" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="55" y2="0">
                <stop offset="0" stopColor={COOL} />
                <stop offset="0.5" stopColor={MID} />
                <stop offset="1" stopColor={HOT} />
              </linearGradient>
            </defs>

            {/* Track */}
            <path
              d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
              fill="none"
              stroke="#0A0A0A"
              strokeOpacity="0.08"
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
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>

          {/* Centre overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-3">
            <CountUpValue
              target={Math.round(ant * 100)}
              className="font-display text-6xl font-bold tabular-nums leading-none"
              style={{ color: antColor(ant, brewing), letterSpacing: "-0.04em", transition: "color 0.4s ease" }}
            />
            <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: antColor(ant, brewing) }}>
              {brewing ? "🔥 brewing" : "anticipation"}
            </span>
            {frame && (
              <span className="mt-0.5 font-mono text-[9px] tracking-wide text-muted">
                market {Math.round(marketProb * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Big event flash — only rendered when there's an event (no dead space) */}
        {flash && (() => {
          const cfg = EVENT_CONFIG[flash.kind];
          return (
            <span
              key={flash.seq}
              className="flash-pop -my-1 flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider"
              style={{ color: cfg.color, borderColor: `${cfg.color}55`, background: `${cfg.color}12` }}
            >
              {cfg.icon} {cfg.label} · {flash.side === "home" ? homeLabel : awayLabel} · {clock(flash.clockSeconds)}
            </span>
          );
        })()}

        {/* "Called It" verdict */}
        {verdict && (
          <div className="flash-pop w-full rounded-xl border border-goal/40 bg-goal/10 px-4 py-3 text-center">
            <div className="font-display text-sm font-semibold uppercase tracking-wide" style={{ color: GOAL }}>
              ✓ You called it
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              the goal came {verdict.deltaSec > 0 ? `${verdict.deltaSec}s` : "moments"} after your read, before the market moved
            </div>
          </div>
        )}

        {/* "Called It" CTA + receipt */}
        {frame && !receipt && (
          <button
            onClick={handleCallIt}
            disabled={calling || connecting}
            className={`relative w-full rounded-xl border px-4 py-3 font-display text-[12px] font-semibold uppercase tracking-wider transition-all disabled:opacity-60 ${
              brewing
                ? "shimmer border-hot bg-hot text-white"
                : "border-ink/15 bg-black/[0.02] text-ink hover:border-hot/60 hover:text-hot"
            }`}
          >
            {connecting
              ? "connect your wallet…"
              : calling
                ? "recording on Solana…"
                : !wallet
                  ? "◎ Connect wallet to call it"
                  : brewing
                    ? "🔥 Call it · I feel a goal coming"
                    : "Call it · record your read on-chain"}
          </button>
        )}

        {receipt && (
          <div className="w-full rounded-xl border border-hot/40 bg-hot/5 px-4 py-3 text-center">
            <div className="font-display text-[12px] font-semibold uppercase tracking-wider text-hot">
              ✓ Called it · recorded on Solana
            </div>
            <div className="mt-1 font-mono text-[10px] text-muted break-all">
              {receipt.txSig.slice(0, 8)}…{receipt.txSig.slice(-8)}
            </div>
            {receipt.calledByShort && (
              <div className="mt-0.5 font-mono text-[10px] text-muted">
                by ◎ {receipt.calledByShort}
              </div>
            )}
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
          <div className="font-display text-4xl font-bold tabular-nums text-ink" style={{ letterSpacing: "-0.03em" }}>
            {frame ? `${frame.homeScore} – ${frame.awayScore}` : "0 – 0"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {frame
              ? `${clock(frame.clockSeconds)} · ${PHASE_LABEL[frame.phase] ?? "Live"}`
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
          <div className="relative h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
            <div
              className="absolute top-0 h-full rounded-full"
              style={{
                left: momentum >= 0 ? "50%" : `${(0.5 + momentum / 2) * 100}%`,
                width: `${(Math.abs(momentum) / 2) * 100}%`,
                background: momentum >= 0 ? HOT : COOL,
                transition: "left 0.4s ease, width 0.4s ease, background 0.4s ease",
              }}
            />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/15" />
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
                  { label: homeLabel, prob: frame.homeProb, color: COOL },
                  { label: awayLabel, prob: frame.awayProb, color: HOT },
                ]
              : [
                  { label: homeLabel, prob: frame.homeProb, color: COOL },
                  { label: "DRAW", prob: frame.drawProb, color: "#7a7d84" },
                  { label: awayLabel, prob: frame.awayProb, color: HOT },
                ]
            ).map(({ label, prob, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-14 truncate font-mono text-[10px] text-muted">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                  <div className="h-full rounded-full" style={{ width: `${prob * 100}%`, backgroundColor: color, transition: "width 0.4s ease" }} />
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
              isLive ? "border-hot/40 bg-hot/5 text-hot" : "border-line text-muted"
            }`}
          >
            {isLive ? <span className="h-1.5 w-1.5 rounded-full bg-hot ping-dot" /> : "◎"}
            {isLive ? "live · TxLINE" : "synthetic demo"}
          </span>
        </div>
      </div>

      {/* Live Signal Feed */}
      {feed.length > 0 && (
        <div data-shot="feed" className="mt-4 w-full max-w-md rounded-2xl p-5 card">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Live signal feed</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted">goals · cards · odds</span>
          </div>
          <div className="flex flex-col gap-2">
            {feed.map((s) => (
              <div key={s.id} className="signal-in flex items-center gap-3 rounded-lg border border-black/[0.06] bg-black/[0.015] px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
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
