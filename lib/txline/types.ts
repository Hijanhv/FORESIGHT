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

/** One score update (GET /api/scores/stream → data). */
export interface RawScorePayload {
  fixtureId: number;
  seq: number;
  confirmed: boolean;
  /** SoccerFixtureStatus — number aligned with GamePhase (statusSoccerId) when numeric. */
  statusId: number | string;
  ts: number; // epoch ms
  action: string; // "Goal" | "Corner" | "YellowCard" | ...
  clock: { running: boolean; seconds: number };
  /** Map<ScoreStatKey, count>. Exact key enum TBD; we key off action+participant instead. */
  stats?: Record<string, number>;
  participant: number; // 1 = home, 2 = away  (TODO: confirm against API ref)
  dataSoccer?: unknown;
}

/** Node of a Merkle proof path (GET /api/scores/stat-validation). */
export interface ProofNode {
  hash: string;
  isRightSibling: boolean;
}

/**
 * stat-validation response — the input to TxODDS's on-chain `validateStat` view.
 * We surface this as the "✓ Verified on Solana" proof; we do not re-implement the
 * verifier (it runs as a read-only call against their `dailyScoresMerkleRoots`).
 */
export interface StatValidationResponse {
  statToProve: number;
  eventStatRoot: string;
  statProof: ProofNode[];
  summary: { fixtureId: number; updateStats: number; eventStatsSubTreeRoot: string };
  subTreeProof: ProofNode[];
  mainTreeProof: ProofNode[];
}
