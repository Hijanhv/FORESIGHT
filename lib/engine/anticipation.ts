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
  /**
   * Debounce: the brew condition must hold continuously for this many ms before
   * `brewing` trips. 0 = instantaneous (legacy). On real feeds this is what stops
   * a single corner from flickering the gauge — brewing means *sustained* pressure.
   */
  brewSustainMs: number;
}

/**
 * Defaults tuned against the *synthetic* demo (a scripted corner barrage → goal).
 * Kept as-is so the guided demo still lights up on cue.
 */
export const DEFAULT_PARAMS: EngineParams = {
  pressureTauMs: 90_000,
  cornerWeight: 1,
  cardWeight: 0.35,
  pressureScale: 2.4,
  marketBaselineTauMs: 120_000,
  marketMoveFull: 0.04,
  brewThreshold: 0.55,
  brewMinPressure: 0.5,
  brewSustainMs: 0,
};

/**
 * Params tuned against REAL World Cup replays (see `scripts/tune-engine`). Real
 * pressure is sparser and slower than the synthetic barrage, so pressure memory
 * is longer and the bar lower — but a sustain window keeps the gauge honest (it
 * fires on held territorial pressure, not one corner). Corners+cards are a weak
 * predictor, so this is deliberately a "pressure vs market-lag" meter, not a
 * goal oracle. Used by the live feed and the past-match replays.
 */
export const REAL_PARAMS: EngineParams = {
  pressureTauMs: 240_000,
  cornerWeight: 1.2,
  cardWeight: 0.35,
  pressureScale: 1.7,
  marketBaselineTauMs: 120_000,
  marketMoveFull: 0.04,
  brewThreshold: 0.4,
  brewMinPressure: 0.36,
  brewSustainMs: 20_000,
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
  clockRunning: boolean;
  /** True once we've seen a Stats snapshot — used to seed totals on a mid-match
   *  join without spiking pressure for events that happened before we connected. */
  sawSnapshot: boolean;
  ts: number;
  // most recent notable pitch event (goal / card) — persists until replaced
  lastEvent: PitchEvent | null;
  // brew debounce: side + ts of the current continuous "brew condition" run
  brewSide: Side | null;
  brewSinceTs: number | null;
}

// In-play phases where `brewing` may trip. Includes extra-time halves (7/9) —
// verified from real knockout streams — so anticipation survives into ET.
const ACTIVE_PHASES = new Set<number>([
  GamePhase.FirstHalf,
  GamePhase.SecondHalf,
  GamePhase.ExtraTimeFirstHalf,
  GamePhase.ExtraTimeSecondHalf,
]);

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
    clockRunning: false,
    sawSnapshot: false,
    ts: 0,
    lastEvent: null,
    brewSide: null,
    brewSinceTs: null,
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
  if (ev.clockRunning != null) state.clockRunning = ev.clockRunning;

  if (ev.snapshot) {
    applySnapshot(state, ev, ev.snapshot, p);
    return;
  }

  // SYNTHETIC PATH — no Stats map, so count from confirmed additive events.
  // (Removals / unconfirmed "possible" events are noise and ignored.)
  if (!ev.confirmed || !isAdd(ev.action)) return;

  const eventKind = ev.statKey !== 0 ? statKeyToEventKind(ev.statKey) : null;
  if (eventKind) {
    state.lastEvent = {
      kind: eventKind,
      side: statKeyToSide(ev.statKey),
      clockSeconds: ev.clockSeconds,
      seq: ev.seq,
    };
  }

  switch (ev.statKey) {
    case StatKey.GoalHome:
      state.homeScore += 1;
      state.pressureHome = 0; // anticipation paid off — reset
      break;
    case StatKey.GoalAway:
      state.awayScore += 1;
      state.pressureAway = 0;
      break;
    case StatKey.CornerHome:
      state.pressureHome += p.cornerWeight;
      state.homeCorners += 1;
      break;
    case StatKey.CornerAway:
      state.pressureAway += p.cornerWeight;
      state.awayCorners += 1;
      break;
    // A card against a side eases pressure; treat as minor pressure for the fouled side.
    case StatKey.YellowHome:
      state.pressureAway += p.cardWeight;
      state.homeYellows += 1;
      break;
    case StatKey.RedHome:
      state.pressureAway += p.cardWeight;
      state.homeReds += 1;
      break;
    case StatKey.YellowAway:
      state.pressureHome += p.cardWeight;
      state.awayYellows += 1;
      break;
    case StatKey.RedAway:
      state.pressureHome += p.cardWeight;
      state.awayReds += 1;
      break;
  }
}

/**
 * LIVE PATH — the Stats map is authoritative. We detect what changed via deltas
 * against current state, which is immune to the live feed's quirks: duplicate
 * "confirmed" events, interleaved unconfirmed "possible" events, and empty Stats
 * maps (already dropped in normalize). The first snapshot only *seeds* totals so
 * a mid-match join doesn't spike pressure for events that predate the connection.
 */
function applySnapshot(
  state: EngineState,
  ev: ScoreEvent,
  s: NonNullable<ScoreEvent["snapshot"]>,
  p: EngineParams,
): void {
  const cur = (v: number | undefined, fallback: number) => (v == null ? fallback : v);
  const nextCorners = { home: cur(s.homeCorners, state.homeCorners), away: cur(s.awayCorners, state.awayCorners) };
  const nextYellows = { home: cur(s.homeYellows, state.homeYellows), away: cur(s.awayYellows, state.awayYellows) };
  const nextReds = { home: cur(s.homeReds, state.homeReds), away: cur(s.awayReds, state.awayReds) };

  const d = {
    goalHome: s.homeScore - state.homeScore,
    goalAway: s.awayScore - state.awayScore,
    cornerHome: nextCorners.home - state.homeCorners,
    cornerAway: nextCorners.away - state.awayCorners,
    yellowHome: nextYellows.home - state.homeYellows,
    yellowAway: nextYellows.away - state.awayYellows,
    redHome: nextReds.home - state.homeReds,
    redAway: nextReds.away - state.awayReds,
  };

  // Adopt the authoritative totals.
  state.homeScore = s.homeScore;
  state.awayScore = s.awayScore;
  state.homeCorners = nextCorners.home;
  state.awayCorners = nextCorners.away;
  state.homeYellows = nextYellows.home;
  state.awayYellows = nextYellows.away;
  state.homeReds = nextReds.home;
  state.awayReds = nextReds.away;

  // First snapshot just syncs state — don't replay history as new events.
  if (!state.sawSnapshot) {
    state.sawSnapshot = true;
    return;
  }

  // Pressure from positive deltas (multiple corners in one update are additive).
  if (d.cornerHome > 0) state.pressureHome += p.cornerWeight * d.cornerHome;
  if (d.cornerAway > 0) state.pressureAway += p.cornerWeight * d.cornerAway;
  // A card against a side eases its pressure → minor pressure to the opponent.
  if (d.yellowHome > 0) state.pressureAway += p.cardWeight * d.yellowHome;
  if (d.yellowAway > 0) state.pressureHome += p.cardWeight * d.yellowAway;
  if (d.redHome > 0) state.pressureAway += p.cardWeight * d.redHome;
  if (d.redAway > 0) state.pressureHome += p.cardWeight * d.redAway;
  // A goal means the anticipation paid off — reset the scorer's pressure.
  if (d.goalHome > 0) state.pressureHome = 0;
  if (d.goalAway > 0) state.pressureAway = 0;

  // Flash the single most notable change this update (goal > red > yellow > corner).
  const flash = pickFlash(d);
  if (flash) {
    state.lastEvent = { kind: flash.kind, side: flash.side, clockSeconds: ev.clockSeconds, seq: ev.seq };
  }
}

type Delta = Record<string, number>;

/** Choose the most significant new event from a set of positive stat deltas. */
function pickFlash(d: Delta): { kind: PitchEvent["kind"]; side: Side } | null {
  if (d.goalHome > 0) return { kind: "goal", side: "home" };
  if (d.goalAway > 0) return { kind: "goal", side: "away" };
  if (d.redHome > 0) return { kind: "red", side: "home" };
  if (d.redAway > 0) return { kind: "red", side: "away" };
  if (d.yellowHome > 0) return { kind: "yellow", side: "home" };
  if (d.yellowAway > 0) return { kind: "yellow", side: "away" };
  if (d.cornerHome > 0) return { kind: "corner", side: "home" };
  if (d.cornerAway > 0) return { kind: "corner", side: "away" };
  return null;
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

  // In play whenever the named phase says so OR the match clock is running
  // (covers status ids the enum doesn't name, without brewing at half-time/pre).
  const inPlay = ACTIVE_PHASES.has(state.phase) || state.clockRunning;
  const anticipation = clamp01(pressureNorm * (1 - marketResponse));

  // Instantaneous brew condition, then a sustain/debounce: it must hold for the
  // same side continuously for `brewSustainMs` before `brewing` trips.
  const instBrew = inPlay && pressureNorm >= p.brewMinPressure && anticipation >= p.brewThreshold;
  if (instBrew && state.brewSide === pressureSide && state.brewSinceTs != null) {
    // continuing the current run — keep its start time
  } else if (instBrew) {
    state.brewSide = pressureSide;
    state.brewSinceTs = state.ts;
  } else {
    state.brewSide = null;
    state.brewSinceTs = null;
  }
  const brewing =
    instBrew && state.brewSinceTs != null && state.ts - state.brewSinceTs >= p.brewSustainMs;

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
