/**
 * Translate raw TxLINE payloads into the normalized `UnifiedEvent` stream the
 * engine consumes. Anything uncertain about the vendor enums is localized here
 * and flagged — swap the lookups once the API-reference enum tables are pinned.
 *
 * Verified against real World Cup streams (see `__fixtures__/`): the odds feed
 * carries **no 1X2 market** — only de-margined Asian Handicap (`part1/part2`),
 * so the "market brain" is the level-line (draw-no-bet) win probability.
 */

import type { OddsTick, ScoreEvent, Side } from "@/types/foresight";
import { GamePhase, StatKey } from "@/types/foresight";
import type { RawOddsPayload, RawScorePayload } from "./types";

/**
 * participant id → side, honouring the fixture's `Participant1IsHome`.
 * TxLINE numbers the two teams 1 and 2; whether participant 1 is the home side
 * is fixture-specific (all current World Cup fixtures have participant1 = home).
 */
function sideOf(participant: number | undefined, p1IsHome: boolean): Side | null {
  if (participant === 1) return p1IsHome ? "home" : "away";
  if (participant === 2) return p1IsHome ? "away" : "home";
  return null;
}

/** (action category, side) → our side-encoded StatKey. Unknown actions are skipped. */
function statKeyFor(action: string, side: Side): number | null {
  const a = action.toLowerCase().replace(/[^a-z]/g, "");
  const home = side === "home";
  if (a.includes("goal")) return home ? StatKey.GoalHome : StatKey.GoalAway;
  if (a.includes("corner")) return home ? StatKey.CornerHome : StatKey.CornerAway;
  if (a.includes("yellow")) return home ? StatKey.YellowHome : StatKey.YellowAway;
  if (a.includes("red")) return home ? StatKey.RedHome : StatKey.RedAway;
  return null;
}

/** Read one integer stat total out of the TxLINE Stats map (0 when absent). */
function stat(stats: Record<string, number>, key: number): number {
  return Number(stats[String(key)] ?? 0);
}

/** SoccerFixtureStatus → GamePhase. Numeric statuses are the statusSoccerId. */
function phaseOf(statusId: number | string | undefined | null): number {
  if (statusId == null) return GamePhase.NotStarted;
  if (typeof statusId === "number") return statusId;
  const s = statusId.toLowerCase();
  if (s.includes("firsthalf") || s === "1h") return GamePhase.FirstHalf;
  if (s.includes("secondhalf") || s === "2h") return GamePhase.SecondHalf;
  if (s.includes("halftime") || s === "ht") return GamePhase.HalfTime;
  if (s.includes("penalt")) return GamePhase.Penalties;
  if (s.includes("end") || s.includes("ft")) return GamePhase.Ended;
  return GamePhase.NotStarted;
}

const num = (raw: string | number | undefined): number =>
  raw === undefined || raw === "NA" ? NaN : Number(raw);

/** Parse the handicap line out of MarketParameters, e.g. "line=-1.25" → -1.25. */
function parseLine(marketParameters: string | undefined): number | null {
  if (!marketParameters) return null;
  const m = /line=(-?\d+(?:\.\d+)?)/.exec(marketParameters);
  return m ? Number(m[1]) : null;
}

interface Probs {
  home: number;
  draw: number;
  away: number;
}

/** Three-way 1X2 market → home/draw/away (kept for feeds that carry it). */
function threeWay(p: RawOddsPayload): Probs | null {
  if (!p.PriceNames || !p.Pct || p.PriceNames.length !== p.Pct.length) return null;
  const at = (label: RegExp, fallbackIdx: number): number => {
    const i = p.PriceNames.findIndex((n) => label.test(n.toLowerCase()));
    return num(p.Pct[i >= 0 ? i : fallbackIdx]);
  };
  const home = at(/^(1|home|h)$/, 0);
  const draw = at(/^(x|draw|d)$/, 1);
  const away = at(/^(2|away|a)$/, 2);
  if (![home, draw, away].every(Number.isFinite)) return null;
  // Pct values are percentages (e.g. 83.96); engine/UI expect 0–1 fractions.
  return { home: home / 100, draw: draw / 100, away: away / 100 };
}

/**
 * Level-line (line=0) Asian Handicap → draw-no-bet win probabilities.
 * This is the actual World Cup market: `PriceNames = ["part1","part2"]`, where
 * part1/part2 are participant1/participant2. Draw is removed, so drawProb = 0.
 */
function asianHandicapLevel(p: RawOddsPayload, p1IsHome: boolean): Probs | null {
  const superType = (p.SuperOddsType ?? "").toUpperCase();
  if (!superType.includes("ASIANHANDICAP")) return null;
  if (!p.PriceNames || p.PriceNames.length !== 2 || !p.Pct) return null;
  if (parseLine(p.MarketParameters) !== 0) return null; // only the level line
  const part1 = num(p.Pct[0]) / 100;
  const part2 = num(p.Pct[1]) / 100;
  if (![part1, part2].every(Number.isFinite)) return null;
  return {
    home: p1IsHome ? part1 : part2,
    away: p1IsHome ? part2 : part1,
    draw: 0,
  };
}

/**
 * Normalize an odds payload to a home/draw/away tick, or null if it isn't the
 * market we track. Handles both the (rare) 1X2 market and the (actual) level
 * Asian Handicap; every other market/line is ignored.
 */
export function normalizeOdds(p: RawOddsPayload, p1IsHome = true): OddsTick | null {
  const pr =
    (p.PriceNames?.length === 3 ? threeWay(p) : null) ?? asianHandicapLevel(p, p1IsHome);
  if (!pr) return null;
  return {
    kind: "odds",
    fixtureId: String(p.FixtureId),
    ts: p.Ts,
    homeProb: pr.home,
    drawProb: pr.draw,
    awayProb: pr.away,
    inRunning: !!p.InRunning,
  };
}

export function normalizeScore(p: RawScorePayload, p1IsHome?: boolean): ScoreEvent {
  const isHome = p1IsHome ?? p.Participant1IsHome ?? true;
  const side = sideOf(p.Participant, isHome);
  const statKey = side != null ? statKeyFor(p.Action, side) : null;

  // The Stats map is the authoritative source for score AND cumulative stats,
  // and also handles mid-match connections where we never saw the events. But
  // MANY non-stat events (possession, throw-in…) carry an EMPTY Stats map — we
  // must NOT treat `{}` as a snapshot of all-zeros, or the score flickers to 0.
  const hasStats = !!p.Stats && Object.keys(p.Stats).length > 0;
  const snapshot = hasStats
    ? {
        homeScore: stat(p.Stats!, StatKey.GoalHome),
        awayScore: stat(p.Stats!, StatKey.GoalAway),
        homeYellows: stat(p.Stats!, StatKey.YellowHome),
        awayYellows: stat(p.Stats!, StatKey.YellowAway),
        homeReds: stat(p.Stats!, StatKey.RedHome),
        awayReds: stat(p.Stats!, StatKey.RedAway),
        homeCorners: stat(p.Stats!, StatKey.CornerHome),
        awayCorners: stat(p.Stats!, StatKey.CornerAway),
      }
    : undefined;

  return {
    kind: "score",
    fixtureId: String(p.FixtureId),
    seq: p.Seq,
    ts: p.Ts,
    confirmed: !!p.Confirmed,
    statKey: statKey ?? 0,
    action: p.Action,
    phase: phaseOf(p.StatusId),
    clockSeconds: p.Clock?.Seconds ?? 0,
    clockRunning: p.Clock?.Running,
    snapshot,
  };
}
