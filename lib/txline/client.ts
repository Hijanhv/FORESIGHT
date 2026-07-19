/**
 * TxLINE client: guest auth → token activation → live SSE streams + on-chain
 * proof fetch. Built against the public API reference; the only Solana-touching
 * step is `activateToken`, which takes a wallet signature produced by `lib/solana`.
 *
 * Streams are exposed as async generators of *normalized* `UnifiedEvent`s, so the
 * ingestion job is just: `for await (const ev of streamOdds(...)) append(ev)`.
 */

import { config, txlineEndpoints } from "@/lib/config";
import type { OddsTick, ScoreEvent, UnifiedEvent } from "@/types/foresight";
import { normalizeOdds, normalizeScore } from "./normalize";
import type {
  RawOddsPayload,
  RawScorePayload,
  StatValidationResponse,
} from "./types";

export interface TxlineAuth {
  /** Short-lived guest session JWT (Authorization: Bearer). */
  jwt: string;
  /** Long-lived API token from activation (X-Api-Token). */
  apiToken: string;
}

/** The wallet-signed activation inputs (produced by the Solana wallet step). */
export interface ActivationInput {
  txSig: string;
  walletSignature: string;
  /** League/competition ids to subscribe; defaults to the free World Cup tier. */
  leagues?: number[];
}

/** Step 1 — open a guest session, returns the session JWT. */
export async function guestStart(): Promise<string> {
  const res = await fetch(`${config.txline.authUrl}${txlineEndpoints.guestStart}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`guest/start failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/** Step 2 — activate the long-lived API token with a wallet signature. */
export async function activateToken(jwt: string, input: ActivationInput): Promise<string> {
  // Activation lives on the auth host (/api/token/activate), not the data host.
  const res = await fetch(`${config.txline.authUrl}/api/token/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      txSig: input.txSig,
      walletSignature: input.walletSignature,
      leagues: input.leagues ?? [],
    }),
  });
  if (!res.ok) throw new Error(`token/activate failed: ${res.status}`);
  const text = await res.text();
  // Response is either a raw token string or a JSON object with a `token` field.
  let token: string;
  try {
    const body = JSON.parse(text) as { token?: string } | string;
    token = typeof body === "string" ? body : (body.token ?? "");
  } catch {
    token = text.trim();
  }
  if (!token) throw new Error("token/activate returned no token");
  return token;
}

function authHeaders(auth: TxlineAuth): HeadersInit {
  return {
    Authorization: `Bearer ${auth.jwt}`,
    "X-Api-Token": auth.apiToken,
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
}

/** Minimal SSE reader over fetch's body stream. Yields parsed `data` payloads, skips heartbeats. */
async function* sse<T>(
  url: string,
  auth: TxlineAuth,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const res = await fetch(url, { headers: authHeaders(auth), signal });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`stream ${url} failed: ${res.status} — ${body.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    // SSE records are separated by a blank line.
    while ((nl = buf.indexOf("\n\n")) >= 0) {
      const record = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of record.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (event === "heartbeat" || dataLines.length === 0) continue;
      // Skip malformed frames instead of throwing — one bad line must not kill
      // the whole stream mid-match.
      let parsed: T;
      try {
        parsed = JSON.parse(dataLines.join("\n")) as T;
      } catch {
        continue;
      }
      yield parsed;
    }
  }
}

/** Fixture metadata we need to label sides correctly (home/away, team names). */
export interface FixtureMeta {
  participant1IsHome: boolean;
  home: string;
  away: string;
  competition: string;
}

interface RawFixtureMeta {
  FixtureId: number;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  Competition: string;
}

/**
 * Look up a fixture in the snapshot so streams can label home/away correctly.
 * Best-effort: returns null on any failure (callers default to participant1=home).
 */
export async function fetchFixtureMeta(
  auth: TxlineAuth,
  fixtureId: string,
): Promise<FixtureMeta | null> {
  try {
    const res = await fetch(`${config.txline.apiUrl}/fixtures/snapshot`, {
      headers: { ...authHeaders(auth), Accept: "application/json" },
    });
    if (!res.ok) return null;
    const list = (await res.json()) as RawFixtureMeta[];
    const f = list.find((x) => String(x.FixtureId) === fixtureId);
    if (!f) return null;
    const p1Home = f.Participant1IsHome !== false;
    return {
      participant1IsHome: p1Home,
      home: p1Home ? f.Participant1 : f.Participant2,
      away: p1Home ? f.Participant2 : f.Participant1,
      competition: f.Competition,
    };
  } catch {
    return null;
  }
}

/** Live, normalized odds ticks (level Asian Handicap → home/away win prob). */
export async function* streamOdds(
  auth: TxlineAuth,
  fixtureId?: string,
  signal?: AbortSignal,
  p1IsHome = true,
): AsyncGenerator<OddsTick> {
  const url = withFixture(`${config.txline.apiUrl}${txlineEndpoints.oddsStream}`, fixtureId);
  for await (const raw of sse<RawOddsPayload>(url, auth, signal)) {
    if (fixtureId && String(raw.FixtureId) !== fixtureId) continue;
    const tick = normalizeOdds(raw, p1IsHome);
    if (tick) yield tick;
  }
}

/** Live, normalized score events. */
export async function* streamScores(
  auth: TxlineAuth,
  fixtureId?: string,
  signal?: AbortSignal,
  p1IsHome = true,
): AsyncGenerator<ScoreEvent> {
  const url = withFixture(`${config.txline.apiUrl}${txlineEndpoints.scoresStream}`, fixtureId);
  for await (const raw of sse<RawScorePayload>(url, auth, signal)) {
    // TxLINE score stream may include all live fixtures; filter to the requested one.
    if (fixtureId && String(raw.FixtureId) !== fixtureId) continue;
    yield normalizeScore(raw, p1IsHome);
  }
}

/** Fetch the Merkle proof bundle for a single score stat (input to on-chain verify). */
export async function fetchStatValidation(
  auth: TxlineAuth,
  fixtureId: string,
  seq: number,
  statKey: number,
): Promise<StatValidationResponse> {
  const path = txlineEndpoints.statValidation(fixtureId, seq, statKey);
  const res = await fetch(`${config.txline.apiUrl}${path}`, { headers: authHeaders(auth) });
  if (!res.ok) throw new Error(`stat-validation failed: ${res.status}`);
  return (await res.json()) as StatValidationResponse;
}

const withFixture = (url: string, fixtureId?: string) =>
  fixtureId ? `${url}?fixtureId=${encodeURIComponent(fixtureId)}` : url;

// ─────────────────────────────────────────────────────────────────────────────
// Historical replay — the "updates" endpoints return past odds/scores as plain
// JSON arrays (no SSE), bucketed into 5-minute intervals. A whole finished match
// is reconstructed by walking every 5-min bucket across its window and
// normalizing the payloads into the SAME UnifiedEvent stream the live feed emits.
// See docs.yaml: GET /{feed}/updates/{epochDay}/{hourOfDay}/{interval}.
// ─────────────────────────────────────────────────────────────────────────────

function jsonHeaders(auth: TxlineAuth): HeadersInit {
  return {
    Authorization: `Bearer ${auth.jwt}`,
    "X-Api-Token": auth.apiToken,
    Accept: "application/json",
  };
}

/** epoch-ms → the (epochDay, hourOfDay, interval) 5-minute bucket that contains it. */
export function bucketOf(ts: number): { epochDay: number; hour: number; interval: number } {
  const epochDay = Math.floor(ts / 86_400_000);
  const ms = ts - epochDay * 86_400_000;
  const hour = Math.floor(ms / 3_600_000);
  const interval = Math.floor((ms - hour * 3_600_000) / 300_000); // 0..11
  return { epochDay, hour, interval };
}

/** Enumerate every 5-minute bucket that overlaps [startTs, endTs] (inclusive). */
function bucketsBetween(startTs: number, endTs: number) {
  const out: Array<{ epochDay: number; hour: number; interval: number }> = [];
  const first = Math.floor(startTs / 300_000) * 300_000;
  for (let t = first; t <= endTs; t += 300_000) out.push(bucketOf(t));
  return out;
}

async function fetchUpdatesBucket<T>(
  feed: "odds" | "scores",
  auth: TxlineAuth,
  epochDay: number,
  hour: number,
  interval: number,
  fixtureId?: string,
): Promise<T[]> {
  const base = `${config.txline.apiUrl}${txlineEndpoints.replay(feed, epochDay, hour, interval)}`;
  const url = fixtureId ? `${base}?fixtureId=${encodeURIComponent(fixtureId)}` : base;
  const res = await fetch(url, { headers: jsonHeaders(auth) });
  if (res.status === 404) return []; // no data for that empty bucket
  if (!res.ok) throw new Error(`${feed}/updates ${epochDay}/${hour}/${interval} → ${res.status}`);
  const body = (await res.json()) as unknown;
  return Array.isArray(body) ? (body as T[]) : [];
}

/** Run `tasks` with bounded concurrency, preserving completion (order re-sorted by caller). */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

export interface FixtureHistory {
  events: UnifiedEvent[];
  oddsCount: number;
  scoreCount: number;
}

/**
 * Reconstruct a finished fixture's full event stream from the historical
 * "updates" buckets between two epoch-ms timestamps. Odds are filtered by
 * `normalizeOdds` to the level-line (draw-no-bet) market; scores keep every
 * confirmed pitch event. Returns one sorted, deduped UnifiedEvent stream.
 */
export async function fetchFixtureHistory(
  auth: TxlineAuth,
  fixtureId: string,
  startTs: number,
  endTs: number,
  opts: { concurrency?: number; p1IsHome?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<FixtureHistory> {
  const p1IsHome = opts.p1IsHome ?? true;
  const buckets = bucketsBetween(startTs, endTs);
  const odds: OddsTick[] = [];
  const scores: ScoreEvent[] = [];
  let done = 0;

  await pool(buckets, opts.concurrency ?? 6, async (b) => {
    const [rawOdds, rawScores] = await Promise.all([
      fetchUpdatesBucket<RawOddsPayload>("odds", auth, b.epochDay, b.hour, b.interval, fixtureId),
      fetchUpdatesBucket<RawScorePayload>("scores", auth, b.epochDay, b.hour, b.interval, fixtureId),
    ]);
    for (const p of rawOdds) {
      if (String(p.FixtureId) !== fixtureId) continue;
      const tick = normalizeOdds(p, p1IsHome);
      if (tick) odds.push(tick);
    }
    for (const p of rawScores) {
      if (String(p.FixtureId) !== fixtureId) continue;
      scores.push(normalizeScore(p, p1IsHome));
    }
    done += 1;
    opts.onProgress?.(done, buckets.length);
  });

  // De-dupe odds ticks that repeat the identical probability at the same ts, and
  // score events by seq (buckets can overlap at boundaries).
  const seenScore = new Set<number>();
  const dedupScores = scores.filter((s) => (seenScore.has(s.seq) ? false : (seenScore.add(s.seq), true)));

  const events: UnifiedEvent[] = [...odds, ...dedupScores].sort(
    (a, b) => a.ts - b.ts || (a.kind === b.kind ? 0 : a.kind === "score" ? -1 : 1),
  );

  return { events, oddsCount: odds.length, scoreCount: dedupScores.length };
}
