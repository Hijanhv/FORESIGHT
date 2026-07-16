/**
 * Core domain types for Foresight.
 * The engine is a deterministic function of the ordered event stream, so these
 * normalized shapes are the contract shared by ingestion (Phase 1), the replay
 * harness (Phase 2), the anticipation engine (Phase 3), and the UI (Phase 4).
 */

/** Soccer stat keys from the TxLINE scores feed (see 04-TXLINE-API-REFERENCE §4). */
export const StatKey = {
  GoalHome: 1,
  GoalAway: 2,
  YellowHome: 3,
  YellowAway: 4,
  RedHome: 5,
  RedAway: 6,
  CornerHome: 7,
  CornerAway: 8,
} as const;
export type StatKey = (typeof StatKey)[keyof typeof StatKey];

/**
 * Game phases (statusSoccerId). Numeric ids verified against a real World Cup
 * knockout stream (Argentina v Cape Verde, went to ET + pens):
 *   1 pre · 2 1H · 3 HT · 4 2H · 6 ET-interval · 7 ET-1H · 8 ET-HT · 9 ET-2H ·
 *   10 pre-pens · 100 finished. Extra-time halves (7/9) are live play — the engine
 *   must treat them as active or `brewing` dies during ET (common in knockouts).
 */
export const GamePhase = {
  NotStarted: 1,
  FirstHalf: 2,
  HalfTime: 3,
  SecondHalf: 4,
  Ended: 5,
  ExtraTimeFirstHalf: 7,
  ExtraTimeHalfTime: 8,
  ExtraTimeSecondHalf: 9,
  Penalties: 12,
  EndedPens: 13,
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export type Side = "home" | "away";

/**
 * Normalized odds tick. `Pct` from the TxLINE odds stream is the de-margined,
 * market-implied probability per outcome — the sharp "market brain".
 */
export interface OddsTick {
  kind: "odds";
  fixtureId: string;
  ts: number; // epoch ms
  homeProb: number; // 0..1
  drawProb: number; // 0..1
  awayProb: number; // 0..1
  inRunning: boolean;
}

/**
 * Cumulative per-side match statistics. These are the ONLY team stats TxLINE's
 * soccer feed carries (StatKey 1–8) — there is no shots/possession/xG in the
 * feed, so everything the UI shows here is real, verifiable data.
 */
export interface MatchStats {
  homeCorners: number;
  awayCorners: number;
  homeYellows: number;
  awayYellows: number;
  homeReds: number;
  awayReds: number;
}

/** Normalized pitch event from the scores stream (act on confirmed:true). */
export interface ScoreEvent {
  kind: "score";
  fixtureId: string;
  seq: number;
  ts: number; // epoch ms
  confirmed: boolean;
  statKey: number; // see StatKey
  action: string; // e.g. "add" | "remove" | "confirm"
  phase: number; // see GamePhase
  clockSeconds: number;
  /** Whether the match clock is running (live feed only). A robust in-play
   *  signal that works even for status ids the enum doesn't name. */
  clockRunning?: boolean;
  /**
   * Cumulative match totals from the TxLINE Stats map — authoritative source for
   * score and stats. Present on live events (the feed sends the full Stats map);
   * absent on synthetic events, where the engine increments counters instead.
   */
  snapshot?: { homeScore: number; awayScore: number } & Partial<MatchStats>;
}

/** The single normalized stream written to logs/events.jsonl and replayed. */
export type UnifiedEvent = OddsTick | ScoreEvent;

/** Running match state derived from the ordered event stream. */
export interface MatchState {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  phase: number;
  clockSeconds: number;
}

/** A notable pitch event to surface in the UI (goal, card). */
export interface PitchEvent {
  kind: "goal" | "yellow" | "red" | "corner";
  side: Side;
  clockSeconds: number;
  seq: number; // unique — UI uses this to detect new events
}

/**
 * One frame of engine output — the clean stream the UI consumes.
 * winProb is the tracked/leading-team market probability; momentum is signed
 * toward the side applying pressure; anticipation is 0..1; brewing is the
 * emotional flag ("🔥 a goal is brewing").
 */
export interface ForesightFrame {
  fixtureId: string;
  ts: number;
  clockSeconds: number;
  phase: number;
  homeScore: number;
  awayScore: number;
  homeProb: number;
  drawProb: number;
  awayProb: number;
  marketVel: number; // d/dt of the leading prob
  momentum: number; // -1..1, signed toward the pressuring side
  pressureSide: Side;
  anticipation: number; // 0..1
  brewing: boolean;
  brewingSide: Side | null;
  lastEvent: PitchEvent | null;
  /** Cumulative real match stats (corners/cards) — goals live in home/awayScore. */
  stats: MatchStats;
}
