/**
 * Turn a finished match's real `UnifiedEvent` stream into a compact, shippable
 * replay: the engine frames the UI plays back, plus the "how the model called it"
 * evidence — for every goal, whether Foresight was already *brewing* before the
 * market repriced, and by how many seconds it led the market.
 *
 * This is the offline half of the past-match feature: `scripts/gen-replays` runs
 * it once per fixture and writes the JSON into `public/replays/`, so the app
 * never has to hit TxLINE (or download tens of MB of odds) at request time.
 */

import type { ForesightFrame, Side, UnifiedEvent } from "@/types/foresight";
import { runEngine } from "@/lib/engine";
import { REAL_PARAMS, EngineParams } from "@/lib/engine";

export interface GoalEvidence {
  /** Match-clock seconds when the goal landed. */
  clockSeconds: number;
  side: Side;
  homeScore: number;
  awayScore: number;
  /** Was Foresight already "brewing" for the scoring side before the goal? */
  calledIt: boolean;
  /** Seconds Foresight was brewing before the goal (0 if it never brewed). */
  leadSeconds: number;
  /** Peak anticipation (0..100) reached in the 5 min before the goal. */
  peakAnticipation: number;
  /** Scoring side's market win-prob when brewing began (%). */
  marketAtBrew: number;
  /** Scoring side's market win-prob ~90s after the goal (%) — the repricing. */
  marketAfter: number;
}

export interface ReplayFrame {
  t: number; // match-clock seconds
  a: number; // anticipation 0..100
  b: 0 | 1; // brewing
  m: number; // momentum -100..100
  hp: number; // home win prob %
  ap: number; // away win prob %
  hs: number; // home score
  as: number; // away score
  ph: number; // phase id
  ev?: { k: "goal" | "yellow" | "red" | "corner"; s: Side; q: number }; // new pitch event (q = seq)
  hc: number; ac: number; hy: number; ay: number; hr: number; ar: number; // stats
}

export interface Replay {
  fixtureId: string;
  home: string;
  away: string;
  round: string;
  kickoffTs: number;
  finalHome: number;
  finalAway: number;
  /** Full match-clock length in seconds (real duration, incl. ET/pens). */
  durationSec: number;
  peakAnticipation: number;
  goals: GoalEvidence[];
  frames: ReplayFrame[];
  generatedAt: number;
}

const pct = (x: number) => Math.round(x * 100);

/** Downsample full engine frames to a smooth, small playback timeline. */
function slimFrames(full: ForesightFrame[]): ReplayFrame[] {
  const out: ReplayFrame[] = [];
  let lastKeptTs = -Infinity;
  let lastSeq = -1;
  let maxClock = 0; // odds ticks don't carry a clock and some events report 0 —
  //                   carry the match clock forward so it never jumps back to 0.
  for (const f of full) {
    maxClock = Math.max(maxClock, f.clockSeconds);
    const newEvent = f.lastEvent && f.lastEvent.seq !== lastSeq;
    const scoreChanged =
      out.length > 0 && (f.homeScore !== out[out.length - 1].hs || f.awayScore !== out[out.length - 1].as);
    const brewChanged = out.length > 0 && (f.brewing ? 1 : 0) !== out[out.length - 1].b;
    // Keep event frames, score/brewing transitions, and a ~2s cadence otherwise.
    if (!(newEvent || scoreChanged || brewChanged || f.ts - lastKeptTs >= 2000 || out.length === 0)) continue;
    lastKeptTs = f.ts;
    const sf: ReplayFrame = {
      t: maxClock,
      a: pct(f.anticipation),
      b: f.brewing ? 1 : 0,
      m: Math.round(f.momentum * 100),
      hp: pct(f.homeProb),
      ap: pct(f.awayProb),
      hs: f.homeScore,
      as: f.awayScore,
      ph: f.phase,
      hc: f.stats.homeCorners,
      ac: f.stats.awayCorners,
      hy: f.stats.homeYellows,
      ay: f.stats.awayYellows,
      hr: f.stats.homeReds,
      ar: f.stats.awayReds,
    };
    if (newEvent && f.lastEvent) {
      sf.ev = { k: f.lastEvent.kind, s: f.lastEvent.side, q: f.lastEvent.seq };
      lastSeq = f.lastEvent.seq;
    } else if (f.lastEvent) {
      lastSeq = f.lastEvent.seq;
    }
    out.push(sf);
  }
  return out;
}

/** Extract per-goal "did the model call it before the market moved?" evidence. */
function goalEvidence(full: ForesightFrame[]): GoalEvidence[] {
  const goals: GoalEvidence[] = [];
  for (let i = 1; i < full.length; i++) {
    const f = full[i];
    const prev = full[i - 1];
    const homeGoal = f.homeScore > prev.homeScore;
    const awayGoal = f.awayScore > prev.awayScore;
    if (!homeGoal && !awayGoal) continue;
    const side: Side = homeGoal ? "home" : "away";
    const goalTs = f.ts;

    // Look back 5 min: was the scoring side brewing, and how flat was the market?
    let brewStartTs: number | null = null;
    let peakAnt = 0;
    let marketAtBrew = side === "home" ? f.homeProb : f.awayProb;
    for (let j = i - 1; j >= 0 && goalTs - full[j].ts <= 300_000; j--) {
      const g = full[j];
      const ant = g.anticipation;
      peakAnt = Math.max(peakAnt, ant);
      const brewingForSide = g.brewing && g.brewingSide === side;
      if (brewingForSide) {
        brewStartTs = g.ts; // keep walking back → earliest continuous brew start
        marketAtBrew = side === "home" ? g.homeProb : g.awayProb;
      } else if (brewStartTs != null) {
        break; // brewing run ended as we walk back — stop at its start
      }
    }

    // Market repricing: scoring side's prob ~90s after the goal.
    let marketAfter = side === "home" ? f.homeProb : f.awayProb;
    for (let j = i; j < full.length && full[j].ts - goalTs <= 90_000; j++) {
      marketAfter = side === "home" ? full[j].homeProb : full[j].awayProb;
    }

    goals.push({
      clockSeconds: f.clockSeconds,
      side,
      homeScore: f.homeScore,
      awayScore: f.awayScore,
      calledIt: brewStartTs != null,
      leadSeconds: brewStartTs != null ? Math.round((goalTs - brewStartTs) / 1000) : 0,
      peakAnticipation: pct(peakAnt),
      marketAtBrew: pct(marketAtBrew),
      marketAfter: pct(marketAfter),
    });
  }
  return goals;
}

export function buildReplay(
  meta: { fixtureId: string; home: string; away: string; round: string; kickoffTs: number },
  events: UnifiedEvent[],
  params: EngineParams = REAL_PARAMS,
): Replay {
  const full = runEngine(events, params);
  const last = full[full.length - 1];
  // Full match-clock length (max reached — covers 1H/2H/ET), for the "97'" label.
  const durationSec = Math.max(0, ...full.map((f) => f.clockSeconds));
  return {
    fixtureId: meta.fixtureId,
    home: meta.home,
    away: meta.away,
    round: meta.round,
    kickoffTs: meta.kickoffTs,
    finalHome: last?.homeScore ?? 0,
    finalAway: last?.awayScore ?? 0,
    durationSec,
    peakAnticipation: pct(Math.max(0, ...full.map((f) => f.anticipation))),
    goals: goalEvidence(full),
    frames: slimFrames(full),
    generatedAt: Date.now(),
  };
}
