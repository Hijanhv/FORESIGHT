/**
 * Raw TxLINE wire shapes, transcribed from the public API reference
 * (txline-docs.txodds.com/api-reference). These are the *vendor* shapes; the
 * normalized `UnifiedEvent` in `types/foresight.ts` is what the rest of the app
 * consumes. Keep all vendor-casing quirks (odds = PascalCase, scores = camelCase)
 * isolated to this file.
 */

/** SSE envelope: `data:` lines carry the payload; `event: heartbeat` is keep-alive. */
export interface SseMessage<T> {
  id?: string; // "timestamp:index"
  event?: string; // undefined for data, "heartbeat" for keep-alive
  data: T;
}

/** One odds update (GET /api/odds/stream → data). */
export interface RawOddsPayload {
  FixtureId: number;
  Ts: number; // epoch ms
  MessageId: string;
  Bookmaker: string;
  BookmakerId: number;
  InRunning: boolean;
  SuperOddsType: string; // market type, e.g. 1X2 full-time match odds
  MarketParameters: string;
  MarketPeriod: string;
  GameState: string;
  PriceNames: string[]; // outcome labels, e.g. ["1","X","2"]
  Prices: number[];
  /** De-margined implied probabilities, 3dp strings ("0.452") or "NA". */
  Pct: string[];
}

/** One score update (GET /api/scores/stream → data). API uses PascalCase. */
export interface RawScorePayload {
  FixtureId: number;
  Seq: number;
  Confirmed?: boolean;
  /** SoccerFixtureStatus numeric id (2 = FirstHalf, etc). */
  StatusId?: number | string;
  Ts: number; // epoch ms
  Action: string; // "goal" | "corner" | "yellow_card" | "throw_in" | ...
  Clock?: { Running: boolean; Seconds: number };
  /** Cumulative match stats keyed by StatKey integer (1=GoalHome, 2=GoalAway, …). */
  Stats?: Record<string, number>;
  Participant?: number; // 1 = home, 2 = away
  Participant1IsHome?: boolean;
  Participant1Id?: number;
  Participant2Id?: number;
  GameState?: string;
  Data?: Record<string, unknown>;
}

/** Node of a Merkle proof path (GET /api/scores/stat-validation). Hashes are
 *  32-byte arrays as delivered by the API. */
export interface ProofNode {
  hash: number[];
  isRightSibling: boolean;
}

/**
 * stat-validation response — the input to TxODDS's on-chain `validateStat` view.
 * We surface this as the "✓ Verified on Solana" proof; we do not re-implement the
 * verifier (it runs as a read-only call against their `dailyScoresMerkleRoots`).
 * Shape verified against a real World Cup fixture.
 */
export interface StatValidationResponse {
  ts: number;
  statToProve: { key: number; value: number; period: number };
  eventStatRoot: number[];
  summary: {
    fixtureId: number;
    updateStats: { updateCount: number; minTimestamp: number; maxTimestamp: number };
    eventStatsSubTreeRoot: number[];
  };
  statProof: ProofNode[];
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}
