/**
 * Synthetic match generator — a deterministic, realistic event stream so the
 * engine, replay harness, and UI all run with zero network and no API token.
 *
 * The scripted arc: a quiet opening, then ~minute 33 the home side piles on a
 * flurry of corners while the market barely moves (pressure builds, anticipation
 * should climb), and a home goal lands at ~minute 36. A well-tuned engine flags
 * "brewing" *before* the goal — that's the demo money shot.
 */

import type { OddsTick, ScoreEvent, UnifiedEvent } from "@/types/foresight";
import { GamePhase, StatKey } from "@/types/foresight";

export interface SyntheticOptions {
  fixtureId?: string;
  /** Wall-clock epoch ms the match kicks off at. */
  startTs?: number;
  /** Seconds of match-clock between odds ticks. */
  oddsIntervalSec?: number;
}

/** Scripted moment when the home goal is scored (match-clock seconds). */
export const SYNTHETIC_GOAL_AT_SEC = 36 * 60;
/** The home corner barrage leading up to it. */
const HOME_CORNERS_AT_SEC = [33 * 60, 33 * 60 + 40, 34 * 60 + 20, 35 * 60, 35 * 60 + 30];

export function generateSyntheticMatch(opts: SyntheticOptions = {}): UnifiedEvent[] {
  const fixtureId = opts.fixtureId ?? "WC-SYN-001";
  const startTs = opts.startTs ?? 1_750_000_000_000;
  const oddsEvery = opts.oddsIntervalSec ?? 15;
  const events: UnifiedEvent[] = [];
  let seq = 1;

  const tsAt = (clockSec: number) => startTs + clockSec * 1000;
  const phaseAt = (clockSec: number): number =>
    clockSec < 45 * 60 ? GamePhase.FirstHalf : GamePhase.SecondHalf;

  // Baseline market: home favourite. Drifts gently; the goal makes it jump.
  let homeProb = 0.46;
  const drawProb = 0.27;

  const pushOdds = (clockSec: number) => {
    const away = 1 - homeProb - drawProb;
    events.push({
      kind: "odds",
      fixtureId,
      ts: tsAt(clockSec),
      homeProb: round3(homeProb),
      drawProb: round3(drawProb),
      awayProb: round3(away),
      inRunning: true,
    } satisfies OddsTick);
  };

  const pushScore = (clockSec: number, statKey: number, action = "add") => {
    events.push({
      kind: "score",
      fixtureId,
      seq: seq++,
      ts: tsAt(clockSec),
      confirmed: true,
      statKey,
      action,
      phase: phaseAt(clockSec),
      clockSeconds: clockSec,
    } satisfies ScoreEvent);
  };

  // Stream odds right up to the goal; market stays sticky through the barrage.
  for (let t = 0; t < SYNTHETIC_GOAL_AT_SEC; t += oddsEvery) {
    // tiny deterministic wobble, no real drift — the point is the market is *slow*
    homeProb = 0.46 + 0.004 * Math.sin(t / 90);
    pushOdds(t);
  }

  // Home corner barrage — pressure with no repricing.
  for (const t of HOME_CORNERS_AT_SEC) pushScore(t, StatKey.CornerHome);

  // The goal. Only *now* does the market snap.
  pushScore(SYNTHETIC_GOAL_AT_SEC, StatKey.GoalHome);
  homeProb = 0.7;
  for (let t = SYNTHETIC_GOAL_AT_SEC + 5; t <= SYNTHETIC_GOAL_AT_SEC + 120; t += oddsEvery) {
    pushOdds(t);
  }

  return events.sort((a, b) => a.ts - b.ts || tieBreak(a, b));
}

// Keep score events before odds at an identical ts so a goal is reflected deterministically.
const tieBreak = (a: UnifiedEvent, b: UnifiedEvent) =>
  a.kind === b.kind ? 0 : a.kind === "score" ? -1 : 1;

const round3 = (x: number) => Math.round(x * 1000) / 1000;
