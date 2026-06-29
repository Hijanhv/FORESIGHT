/**
 * TxLINE client: guest auth → token activation → live SSE streams + on-chain
 * proof fetch. Built against the public API reference; the only Solana-touching
 * step is `activateToken`, which takes a wallet signature produced by `lib/solana`.
 *
 * Streams are exposed as async generators of *normalized* `UnifiedEvent`s, so the
 * ingestion job is just: `for await (const ev of streamOdds(...)) append(ev)`.
 */

import { config, txlineEndpoints } from "@/lib/config";
import type { OddsTick, ScoreEvent } from "@/types/foresight";
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
  return { Authorization: `Bearer ${auth.jwt}`, "X-Api-Token": auth.apiToken };
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
      yield JSON.parse(dataLines.join("\n")) as T;
    }
  }
}

/** Live, normalized 1X2 odds ticks. */
export async function* streamOdds(
  auth: TxlineAuth,
  fixtureId?: string,
  signal?: AbortSignal,
): AsyncGenerator<OddsTick> {
  const url = withFixture(`${config.txline.apiUrl}${txlineEndpoints.oddsStream}`, fixtureId);
  for await (const raw of sse<RawOddsPayload>(url, auth, signal)) {
    const tick = normalizeOdds(raw);
    if (tick) yield tick;
  }
}

/** Live, normalized score events. */
export async function* streamScores(
  auth: TxlineAuth,
  fixtureId?: string,
  signal?: AbortSignal,
): AsyncGenerator<ScoreEvent> {
  const url = withFixture(`${config.txline.apiUrl}${txlineEndpoints.scoresStream}`, fixtureId);
  for await (const raw of sse<RawScorePayload>(url, auth, signal)) {
    // TxLINE score stream may include all live fixtures; filter to the requested one.
    if (fixtureId && String(raw.FixtureId) !== fixtureId) continue;
    yield normalizeScore(raw);
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
