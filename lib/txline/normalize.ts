/**
 * Translate raw TxLINE payloads into the normalized `UnifiedEvent` stream the
 * engine consumes. Anything uncertain about the vendor enums is localized here
 * and flagged — swap the lookups once the API-reference enum tables are pinned.
 */

import type { OddsTick, ScoreEvent, Side } from "@/types/foresight";
import { GamePhase, StatKey } from "@/types/foresight";
import type { RawOddsPayload, RawScorePayload } from "./types";

/** participant id → side. TODO: confirm 1=home / 2=away against the API reference. */
function sideOf(participant: number): Side | null {
  if (participant === 1) return "home";
  if (participant === 2) return "away";
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

/** SoccerFixtureStatus → GamePhase. Numeric statuses are assumed to be statusSoccerId. */
function phaseOf(statusId: number | string): number {
  if (typeof statusId === "number") return statusId;
  const s = statusId.toLowerCase();
  if (s.includes("firsthalf") || s === "1h") return GamePhase.FirstHalf;
  if (s.includes("secondhalf") || s === "2h") return GamePhase.SecondHalf;
  if (s.includes("halftime") || s === "ht") return GamePhase.HalfTime;
  if (s.includes("penalt")) return GamePhase.Penalties;
  if (s.includes("end") || s.includes("ft")) return GamePhase.Ended;
  return GamePhase.NotStarted;
}

/** Pull the home/draw/away de-margined probabilities out of a 1X2 odds payload. */
function probs(p: RawOddsPayload): { home: number; draw: number; away: number } | null {
  if (!p.PriceNames || !p.Pct || p.PriceNames.length !== p.Pct.length) return null;
  const pct = (label: RegExp, fallbackIdx: number): number => {
    const i = p.PriceNames.findIndex((n) => label.test(n.toLowerCase()));
    const raw = p.Pct[i >= 0 ? i : fallbackIdx];
    const v = raw === "NA" ? NaN : Number(raw);
    return v;
  };
  const home = pct(/^(1|home|h)$/, 0);
  const draw = pct(/^(x|draw|d)$/, 1);
  const away = pct(/^(2|away|a)$/, 2);
  if (![home, draw, away].every((v) => Number.isFinite(v))) return null;
  return { home, draw, away };
}

/** Is this payload the full-time 1X2 market we track? (Other markets are ignored.) */
function isMatchOdds(p: RawOddsPayload): boolean {
  // TODO: tighten against the exact SuperOddsType/MarketPeriod strings from the API ref.
  const period = (p.MarketPeriod ?? "").toLowerCase();
  const okPeriod = period === "" || period.includes("full") || period.includes("match");
  return p.PriceNames?.length === 3 && okPeriod;
}

export function normalizeOdds(p: RawOddsPayload): OddsTick | null {
  if (!isMatchOdds(p)) return null;
  const pr = probs(p);
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

export function normalizeScore(p: RawScorePayload): ScoreEvent | null {
  const side = sideOf(p.participant);
  if (!side) return null;
  const statKey = statKeyFor(p.action, side);
  if (statKey == null) return null;
  return {
    kind: "score",
    fixtureId: String(p.fixtureId),
    seq: p.seq,
    ts: p.ts,
    confirmed: !!p.confirmed,
    statKey,
    action: "add",
    phase: phaseOf(p.statusId),
    clockSeconds: p.clock?.seconds ?? 0,
  };
}
