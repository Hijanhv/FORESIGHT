/**
 * The Foresight anticipation engine.
 *
 * It is a *deterministic* reducer over the ordered event stream (see
 * `types/foresight.ts`): the same events in the same order always produce the
 * same frames. That property is what makes the replay harness (Phase 2) and the
 * live feed (Phase 1) interchangeable — and what lets us tune against history.
 *
 * The core insight Foresight encodes:
 *   on-pitch pressure surges *before* the market reprices. So when a side is
 *   piling on pressure (corners, attacks) yet its market win-probability is
 *   still flat, a goal is "brewing". The moment the market starts to move, the
 *   edge is gone and anticipation fades.
 */

import type {
  ForesightFrame,
  OddsTick,
  PitchEvent,
  ScoreEvent,
  Side,
  UnifiedEvent,
} from "@/types/foresight";
import { GamePhase, StatKey } from "@/types/foresight";

/** Tunable knobs. Defaults are hand-set against synthetic matches; retune on real replays. */
export interface EngineParams {
  /** Exp-decay time constant for on-pitch pressure (ms). Larger = longer memory. */
  pressureTauMs: number;
  /** Pressure added by one confirmed corner. */
  cornerWeight: number;
  /** Pressure added by a card won (minor; opponent under pressure). */
  cardWeight: number;
  /** Maps the home-vs-away pressure gap to 0..1 via 1 - exp(-gap/scale). */
  pressureScale: number;
  /** Time constant (ms) of the EMA baseline used to detect market repricing. */
  marketBaselineTauMs: number;
  /** Prob move (0..1) that counts as the market having *fully* repriced. */
  marketMoveFull: number;
  /** anticipation >= this (and enough pressure) => brewing. */
  brewThreshold: number;
  /** Minimum normalized pressure before brewing can trip. */
  brewMinPressure: number;
}

export const DEFAULT_PARAMS: EngineParams = {
  pressureTauMs: 90_000,
  cornerWeight: 1,
  cardWeight: 0.35,
  pressureScale: 2.4,
  marketBaselineTauMs: 120_000,
  marketMoveFull: 0.04,
  brewThreshold: 0.55,
  brewMinPressure: 0.5,
};

export interface EngineState {
  fixtureId: string;
  // latest de-margined market probabilities
  homeProb: number;
  drawProb: number;
  awayProb: number;
  // slow EMA baselines, to tell whether the market has *recently* moved
  homeBaseline: number;
  awayBaseline: number;
  lastOddsTs: number | null;
  leadProb: number; // last max(home, away) prob, for velocity
  marketVel: number; // d/dt of the leading prob (prob per second)
  // decaying on-pitch pressure per side
  pressureHome: number;
  pressureAway: number;
  lastPressureTs: number | null;
  // running match state
  homeScore: number;
  awayScore: number;
  // cumulative real match stats (corners / cards, per side)
  homeCorners: number;
  awayCorners: number;
  homeYellows: number;
  awayYellows: number;
  homeReds: number;
  awayReds: number;
  phase: number;
  clockSeconds: number;
  ts: number;
  // most recent notable pitch event (goal / card) — persists until replaced
  lastEvent: PitchEvent | null;
}

const ACTIVE_PHASES = new Set<number>([GamePhase.FirstHalf, GamePhase.SecondHalf]);

export function initState(fixtureId: string): EngineState {
  return {
    fixtureId,
    homeProb: NaN,
    drawProb: NaN,
    awayProb: NaN,
    homeBaseline: NaN,
    awayBaseline: NaN,
    lastOddsTs: null,
    leadProb: NaN,
    marketVel: 0,
    pressureHome: 0,
    pressureAway: 0,
    lastPressureTs: null,
    homeScore: 0,
    awayScore: 0,
    homeCorners: 0,
    awayCorners: 0,
    homeYellows: 0,
    awayYellows: 0,
    homeReds: 0,
    awayReds: 0,
    phase: GamePhase.NotStarted,
    clockSeconds: 0,
    ts: 0,
    lastEvent: null,
  };
}

/** Decay both pressure accumulators forward to time `ts`. */
function decayPressure(state: EngineState, ts: number, p: EngineParams): void {
  if (state.lastPressureTs == null) {
    state.lastPressureTs = ts;
    return;
  }
  const dt = ts - state.lastPressureTs;
  if (dt <= 0) return;
  const k = Math.exp(-dt / p.pressureTauMs);
  state.pressureHome *= k;
  state.pressureAway *= k;
  state.lastPressureTs = ts;
}

function applyOdds(state: EngineState, ev: OddsTick, p: EngineParams): void {
  const lead = Math.max(ev.homeProb, ev.awayProb);
  if (state.lastOddsTs != null && Number.isFinite(state.leadProb)) {
    const dtSec = (ev.ts - state.lastOddsTs) / 1000;
    state.marketVel = dtSec > 0 ? (lead - state.leadProb) / dtSec : state.marketVel;
  }
  // seed or advance the slow baselines
  if (!Number.isFinite(state.homeBaseline)) {
    state.homeBaseline = ev.homeProb;
    state.awayBaseline = ev.awayProb;
  } else if (state.lastOddsTs != null) {
    const a = 1 - Math.exp(-(ev.ts - state.lastOddsTs) / p.marketBaselineTauMs);
    state.homeBaseline += a * (ev.homeProb - state.homeBaseline);
    state.awayBaseline += a * (ev.awayProb - state.awayBaseline);
  }
  state.homeProb = ev.homeProb;
  state.drawProb = ev.drawProb;
  state.awayProb = ev.awayProb;
  state.leadProb = lead;
  state.lastOddsTs = ev.ts;
}

function applyScore(state: EngineState, ev: ScoreEvent, p: EngineParams): void {
  state.phase = ev.phase;
  state.clockSeconds = ev.clockSeconds;

  // The Stats snapshot is authoritative for score AND cumulative stats — this
  // handles mid-match connections where we never see the original events.
  // Synthetic events carry no snapshot, so those counters are incremented below.
  if (ev.snapshot) {
    const s = ev.snapshot;
    state.homeScore = s.homeScore;
    state.awayScore = s.awayScore;
    if (s.homeCorners != null) state.homeCorners = s.homeCorners;
    if (s.awayCorners != null) state.awayCorners = s.awayCorners;
    if (s.homeYellows != null) state.homeYellows = s.homeYellows;
    if (s.awayYellows != null) state.awayYellows = s.awayYellows;
    if (s.homeReds != null) state.homeReds = s.homeReds;
    if (s.awayReds != null) state.awayReds = s.awayReds;
  }

  // Only confirmed, additive events affect pressure/counters. (Removals/unconfirms are noise.)
  if (!ev.confirmed || !isAdd(ev.action)) return;

  const eventKind = ev.statKey !== 0 ? statKeyToEventKind(ev.statKey) : null;
  if (eventKind && ev.statKey !== 0) {
    state.lastEvent = {
      kind: eventKind,
      side: statKeyToSide(ev.statKey),
      clockSeconds: ev.clockSeconds,
      seq: ev.seq,
    };
  }

  switch (ev.statKey) {
    case StatKey.GoalHome:
      if (!ev.snapshot) state.homeScore += 1; // fallback if no Stats map
      state.pressureHome = 0; // anticipation paid off — reset
      break;
    case StatKey.GoalAway:
      if (!ev.snapshot) state.awayScore += 1;
      state.pressureAway = 0;
      break;
    case StatKey.CornerHome:
      state.pressureHome += p.cornerWeight;
      if (!ev.snapshot) state.homeCorners += 1;
      break;
    case StatKey.CornerAway:
      state.pressureAway += p.cornerWeight;
      if (!ev.snapshot) state.awayCorners += 1;
      break;
    // A card against a side eases pressure; treat as minor pressure for the fouled side.
    case StatKey.YellowHome:
      state.pressureAway += p.cardWeight;
      if (!ev.snapshot) state.homeYellows += 1;
      break;
    case StatKey.RedHome:
      state.pressureAway += p.cardWeight;
      if (!ev.snapshot) state.homeReds += 1;
      break;
    case StatKey.YellowAway:
      state.pressureHome += p.cardWeight;
      if (!ev.snapshot) state.awayYellows += 1;
      break;
    case StatKey.RedAway:
      state.pressureHome += p.cardWeight;
      if (!ev.snapshot) state.awayReds += 1;
      break;
  }
}

function statKeyToEventKind(statKey: number): PitchEvent["kind"] | null {
  if (statKey === StatKey.GoalHome || statKey === StatKey.GoalAway) return "goal";
  if (statKey === StatKey.YellowHome || statKey === StatKey.YellowAway) return "yellow";
  if (statKey === StatKey.RedHome || statKey === StatKey.RedAway) return "red";
  if (statKey === StatKey.CornerHome || statKey === StatKey.CornerAway) return "corner";
  return null;
}

function statKeyToSide(statKey: number): Side {
  return statKey % 2 === 1 ? "home" : "away"; // odd keys = home, even = away
}

function isAdd(action: string): boolean {
  const a = action.toLowerCase();
  return a === "add" || a === "confirm" || a === "goal" || a === "corner" || a === "card";
}

function frame(state: EngineState, p: EngineParams): ForesightFrame {
  const gap = state.pressureHome - state.pressureAway;
  const pressureSide: Side = gap >= 0 ? "home" : "away";
  const pressureNorm = 1 - Math.exp(-Math.abs(gap) / p.pressureScale); // 0..1
  const momentum = Math.sign(gap) * pressureNorm; // -1..1, + toward home

  // Has the market already moved toward the pressuring side? If so, fade.
  const sideProb = pressureSide === "home" ? state.homeProb : state.awayProb;
  const sideBaseline = pressureSide === "home" ? state.homeBaseline : state.awayBaseline;
  const marketMove = Number.isFinite(sideBaseline) ? Math.max(0, sideProb - sideBaseline) : 0;
  const marketResponse = clamp01(marketMove / p.marketMoveFull);

  const anticipation = clamp01(pressureNorm * (1 - marketResponse));
  const brewing =
    ACTIVE_PHASES.has(state.phase) &&
    pressureNorm >= p.brewMinPressure &&
    anticipation >= p.brewThreshold;

  return {
    fixtureId: state.fixtureId,
    ts: state.ts,
    clockSeconds: state.clockSeconds,
    phase: state.phase,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    homeProb: orZero(state.homeProb),
    drawProb: orZero(state.drawProb),
    awayProb: orZero(state.awayProb),
    marketVel: state.marketVel,
    momentum,
    pressureSide,
    anticipation,
    brewing,
    brewingSide: brewing ? pressureSide : null,
    lastEvent: state.lastEvent,
    stats: {
      homeCorners: state.homeCorners,
      awayCorners: state.awayCorners,
      homeYellows: state.homeYellows,
      awayYellows: state.awayYellows,
      homeReds: state.homeReds,
      awayReds: state.awayReds,
    },
  };
}

/** Advance the state by one event and return the resulting frame. */
export function step(
  state: EngineState,
  event: UnifiedEvent,
  params: EngineParams = DEFAULT_PARAMS,
): ForesightFrame {
  state.ts = event.ts;
  decayPressure(state, event.ts, params);
  if (event.kind === "odds") applyOdds(state, event, params);
  else applyScore(state, event, params);
  return frame(state, params);
}

/** Run the whole ordered stream and collect every frame. */
export function runEngine(
  events: UnifiedEvent[],
  params: EngineParams = DEFAULT_PARAMS,
): ForesightFrame[] {
  const fixtureId = events[0]?.fixtureId ?? "";
  const state = initState(fixtureId);
  return events.map((e) => step(state, e, params));
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const orZero = (x: number) => (Number.isFinite(x) ? x : 0);
