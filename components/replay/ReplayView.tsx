"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Replay, GoalEvidence } from "@/lib/replay/build";

// thermal palette (matches the engine / gauge)
const COOL = "#2B5CFF";
const MID = "#FFBC1F";
const HOT = "#FF2E3F";
const GOAL = "#12B76A";

const PHASE_LABEL: Record<number, string> = {
  1: "pre", 2: "1H", 3: "HT", 4: "2H", 7: "ET", 8: "ET", 9: "ET", 12: "pens", 13: "FT",
};

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function antColor(a: number, brewing: boolean): string {
  if (brewing) return HOT;
  if (a > 60) return MID;
  return COOL;
}

// playback speed → how many timeline frames to advance per real second
const SPEEDS = [30, 60, 120] as const;
const fpsFor = (speed: number) => speed / 3; // 30×→10fps, 60×→20fps, 120×→40fps

export function ReplayView({ replay }: { replay: Replay }) {
  const { frames, goals } = replay;
  const lastIdx = frames.length - 1;
  const [vidx, setVidx] = useState(0); // playhead as a (float) frame index
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(60);

  // Mirror the latest state into refs (updated in an effect, not during render)
  // so the single rAF loop can read current values without re-subscribing.
  const vidxRef = useRef(0);
  const playingRef = useRef(true);
  const speedRef = useRef<number>(60);
  useEffect(() => {
    vidxRef.current = vidx;
    playingRef.current = playing;
    speedRef.current = speed;
  });

  // The slim frames are ordered by wall-time; the match-clock `t` is unreliable
  // (odds ticks carry no clock), so we pace by frame index and read the
  // carried-forward monotonic clock for display.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (playingRef.current) {
        const next = Math.min(lastIdx, vidxRef.current + dt * fpsFor(speedRef.current));
        setVidx(next);
        if (next >= lastIdx) setPlaying(false);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lastIdx]);

  const idx = Math.min(lastIdx, Math.floor(vidx));
  const f = frames[idx];
  const brewing = f.b === 1;
  const market = Math.max(f.hp, f.ap);
  const drawPct = Math.max(0, 100 - f.hp - f.ap);

  // Frame index of each goal event, zipped with goals[] in chronological order.
  const goalMarks = useMemo(() => {
    const marks: number[] = [];
    frames.forEach((fr, i) => { if (fr.ev?.k === "goal") marks.push(i); });
    return marks;
  }, [frames]);

  // Goal currently under the playhead → flash it briefly.
  const activeGoal = useMemo<GoalEvidence | null>(() => {
    for (let k = 0; k < goalMarks.length && k < goals.length; k++) {
      if (idx >= goalMarks[k] && idx - goalMarks[k] < 55) return goals[k];
    }
    return null;
  }, [goalMarks, goals, idx]);

  const calledGoals = goals.filter((g) => g.calledIt).length;
  const seek = (clientX: number, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setVidx(p * lastIdx);
  };
  const pctOf = (i: number) => (lastIdx ? (i / lastIdx) * 100 : 0);

  return (
    <>
      {brewing && <div className="brewing-vignette" aria-hidden />}

      {/* headline scorecard — honest hit-rate on this real match */}
      <div className="mb-4 w-full max-w-md text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Replay · real TxLINE history · {replay.round}
        </div>
        <div className="mt-1 font-display text-lg font-semibold text-ink">
          {replay.home} {replay.finalHome}–{replay.finalAway} {replay.away}
        </div>
        <div className="mt-1 font-mono text-[11px] text-muted">
          Foresight flagged{" "}
          <span style={{ color: calledGoals ? GOAL : undefined }} className="font-semibold">
            {calledGoals} of {goals.length}
          </span>{" "}
          goals before the market moved · peak anticipation {replay.peakAnticipation}
        </div>
      </div>

      <div className={`relative flex w-full max-w-md flex-col items-center gap-5 rounded-2xl p-6 card sm:p-7 ${brewing ? "brewing-ring" : ""}`}>
        {/* header */}
        <div className="flex w-full items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {replay.home} v {replay.away}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-muted">
            ⟲ replay
          </span>
        </div>

        {/* arc gauge */}
        <div className="relative">
          <svg viewBox="0 0 64 55" width={200} height={172} aria-label={`Anticipation ${f.a}`}>
            <defs>
              <linearGradient id="replayArc" gradientUnits="userSpaceOnUse" x1="9" y1="0" x2="55" y2="0">
                <stop offset="0" stopColor={COOL} />
                <stop offset="0.5" stopColor={MID} />
                <stop offset="1" stopColor={HOT} />
              </linearGradient>
            </defs>
            <path d="M15.74 49.26 A23 23 0 1 1 48.26 49.26" fill="none" stroke="#0A0A0A" strokeOpacity="0.08" strokeWidth="4" strokeLinecap="round" />
            <path
              d="M15.74 49.26 A23 23 0 1 1 48.26 49.26"
              fill="none" stroke="url(#replayArc)" strokeWidth="4.5" strokeLinecap="round"
              pathLength={1} strokeDasharray={`${(f.a / 100).toFixed(4)} 2`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-3">
            <span className="font-display text-6xl font-bold tabular-nums leading-none" style={{ color: antColor(f.a, brewing), letterSpacing: "-0.04em" }}>
              {f.a}
            </span>
            <span className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color: antColor(f.a, brewing) }}>
              {brewing ? "🔥 brewing" : "anticipation"}
            </span>
            <span className="mt-0.5 font-mono text-[9px] tracking-wide text-muted">market {market}%</span>
          </div>
        </div>

        {/* live goal flash / verdict */}
        {activeGoal && (
          <div
            key={activeGoal.clockSeconds}
            className="flash-pop w-full rounded-xl border px-4 py-3 text-center"
            style={{
              borderColor: activeGoal.calledIt ? `${GOAL}66` : "rgba(10,10,10,0.12)",
              background: activeGoal.calledIt ? `${GOAL}12` : "rgba(10,10,10,0.02)",
            }}
          >
            <div className="font-display text-sm font-semibold uppercase tracking-wide" style={{ color: activeGoal.calledIt ? GOAL : "#0a0a0a" }}>
              ⚽ {mmss(activeGoal.clockSeconds)} {activeGoal.side === "home" ? replay.home : replay.away} scores
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              {activeGoal.calledIt
                ? `✓ Foresight called it — brewing ${activeGoal.leadSeconds}s before · market ${activeGoal.marketAtBrew}%→${activeGoal.marketAfter}% after`
                : `no pre-signal — against the run of play`}
            </div>
          </div>
        )}

        {/* score & clock */}
        <div className="text-center">
          <div className="font-display text-4xl font-bold tabular-nums text-ink" style={{ letterSpacing: "-0.03em" }}>
            {f.hs} – {f.as}
          </div>
          <div className="mt-1 font-mono text-[11px] text-muted">
            {mmss(f.t)} · {PHASE_LABEL[f.ph] ?? "live"}
          </div>
        </div>

        {/* momentum */}
        <div className="w-full space-y-1.5">
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
            <span>{replay.away}</span><span>momentum</span><span>{replay.home}</span>
          </div>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
            <div className="absolute top-0 h-full rounded-full" style={{
              left: f.m >= 0 ? "50%" : `${(0.5 + f.m / 200) * 100}%`,
              width: `${(Math.abs(f.m) / 200) * 100}%`,
              background: f.m >= 0 ? HOT : COOL,
            }} />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/15" />
          </div>
        </div>

        {/* market win prob */}
        <div className="w-full space-y-2">
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-muted">
            <span>market win prob</span><span>{drawPct < 1 ? "draw-no-bet" : "1X2"}</span>
          </div>
          {(drawPct < 1
            ? [{ label: replay.home, prob: f.hp, color: COOL }, { label: replay.away, prob: f.ap, color: HOT }]
            : [{ label: replay.home, prob: f.hp, color: COOL }, { label: "DRAW", prob: drawPct, color: "#7a7d84" }, { label: replay.away, prob: f.ap, color: HOT }]
          ).map(({ label, prob, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-16 truncate font-mono text-[10px] text-muted">{label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                <div className="h-full rounded-full" style={{ width: `${prob}%`, backgroundColor: color }} />
              </div>
              <span className="w-8 text-right font-mono text-[10px] tabular-nums text-ink">{prob}%</span>
            </div>
          ))}
        </div>

        {/* stats */}
        <div className="flex w-full justify-between font-mono text-[10px] text-muted">
          <span>corners {f.hc}-{f.ac}</span>
          <span>yellows {f.hy}-{f.ay}</span>
          <span>reds {f.hr}-{f.ar}</span>
        </div>

        {/* transport: timeline with goal markers */}
        <div className="w-full space-y-2 pt-1">
          <div
            className="relative h-2.5 cursor-pointer rounded-full bg-black/[0.07]"
            onClick={(e) => seek(e.clientX, e.currentTarget)}
            role="slider" aria-label="Seek match" aria-valuenow={idx} aria-valuemin={0} aria-valuemax={lastIdx} tabIndex={0}
          >
            <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${pctOf(vidx)}%`, background: brewing ? HOT : "#0a0a0a" }} />
            {goalMarks.map((m, i) => (
              <span key={i} title={`${mmss(goals[i]?.clockSeconds ?? 0)} goal`} className="absolute top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-full" style={{
                left: `${pctOf(m)}%`,
                background: goals[i]?.calledIt ? GOAL : "#0a0a0a55",
              }} />
            ))}
            <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink shadow" style={{ left: `${pctOf(vidx)}%` }} />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => { if (vidx >= lastIdx) setVidx(0); setPlaying((p) => !p); }} className="rounded-full border border-line px-3 py-1 font-mono text-[11px] text-ink transition-colors hover:border-hot/60 hover:text-hot">
              {playing ? "⏸ pause" : vidx >= lastIdx ? "⟲ replay" : "⏵ play"}
            </button>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => setSpeed(s)} className={`rounded-full px-2 py-1 font-mono text-[10px] transition-colors ${speed === s ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* goal timeline — the honest per-goal ledger */}
      <div className="mt-4 w-full max-w-md rounded-2xl p-5 card">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Goals · how the model read them</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">real data</span>
        </div>
        <div className="flex flex-col gap-2">
          {goals.map((g, i) => {
            const near = goalMarks[i] != null && idx >= goalMarks[i] - 4 && idx - goalMarks[i] < 55;
            return (
              <button
                key={i}
                onClick={() => { setVidx(Math.max(0, (goalMarks[i] ?? 0) - 40)); setPlaying(true); }}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${near ? "border-ink/20 bg-black/[0.03]" : "border-black/[0.06] bg-black/[0.015] hover:border-ink/15"}`}
              >
                <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-muted">{mmss(g.clockSeconds)}</span>
                <span className="w-14 shrink-0 font-mono text-[11px] text-ink">{g.homeScore}-{g.awayScore}</span>
                <span className="flex-1 truncate font-mono text-[11px]" style={{ color: g.calledIt ? GOAL : "#7a7d84" }}>
                  {g.calledIt ? `✓ called ${g.leadSeconds}s early · mkt ${g.marketAtBrew}%→${g.marketAfter}%` : "— no pre-signal"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
