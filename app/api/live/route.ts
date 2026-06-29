/**
 * Live ingestion route — authenticates with TxLINE, merges the odds and scores
 * SSE streams for a given fixture, runs each event through the anticipation
 * engine, and re-streams ForesightFrames to the browser client.
 *
 * Usage:  GET /api/live?fixtureId=<id>
 *
 * Requires TXLINE_AUTH_URL / TXLINE_API_URL / WALLET_KEYPAIR_PATH in .env.
 * Returns 503 when env vars are absent so callers can fall back to /api/gauge.
 */

import type { NextRequest } from "next/server";
import { guestStart, activateToken, streamOdds, streamScores } from "@/lib/txline/client";
import { buildWalletProof } from "@/lib/solana";
import { initState, step } from "@/lib/engine";
import type { UnifiedEvent } from "@/types/foresight";

export const dynamic = "force-dynamic";

function isConfigured(): boolean {
  return !!(
    process.env.TXLINE_AUTH_URL &&
    process.env.TXLINE_API_URL &&
    process.env.WALLET_KEYPAIR_PATH
  );
}

// Cache the activated API token across requests — the Solana subscription is
// valid for weeks so we don't need a new tx on every SSE connection.
let cachedApiToken: string | null = null;
let tokenExpiresAt = 0;

async function getApiToken(jwt: string): Promise<string> {
  if (cachedApiToken && Date.now() < tokenExpiresAt) {
    console.log("[/api/live] reusing cached API token");
    return cachedApiToken;
  }
  const proof = await buildWalletProof(jwt, { serviceLevelId: 12, durationWeeks: 4 });
  const token = await activateToken(jwt, {
    txSig: proof.txSig,
    walletSignature: proof.walletSignature,
    leagues: proof.leagues,
  });
  cachedApiToken = token;
  tokenExpiresAt = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 days
  console.log(`[/api/live] activated new token: ${token.slice(0, 20)}…`);
  return token;
}

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return new Response("TxLINE env vars not set — use /api/gauge for the synthetic demo.", {
      status: 503,
    });
  }

  const fixtureId = request.nextUrl.searchParams.get("fixtureId") ?? undefined;

  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cancelled = true;
        }
      };

      const sendEvent = (eventType: string, payload: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          cancelled = true;
        }
      };

      const keepalive = () => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          cancelled = true;
        }
      };

      const run = async () => {
        // 1. Auth — reuse cached token if available, else full Solana subscribe.
        const jwt = await guestStart();
        const apiToken = await getApiToken(jwt);
        const auth = { jwt, apiToken };

        // 2. Merge odds and scores into one ordered channel via an async queue.
        const queue: UnifiedEvent[] = [];
        let wakeResolve: (() => void) | null = null;
        const wake = () => { wakeResolve?.(); wakeResolve = null; };

        const enqueue = (ev: UnifiedEvent) => {
          queue.push(ev);
          wake();
        };

        const abort = new AbortController();

        const withRetry = async (
          name: string,
          run: () => AsyncGenerator<UnifiedEvent>,
        ) => {
          let delay = 1_000;
          while (!cancelled && !abort.signal.aborted) {
            try {
              for await (const ev of run()) {
                if (cancelled || abort.signal.aborted) break;
                enqueue(ev);
              }
              break; // clean close — no retry needed
            } catch (err) {
              if (cancelled || abort.signal.aborted) break;
              const isReset =
                err instanceof Error &&
                (err.message.includes("ECONNRESET") || err.message.includes("terminated"));
              console.error(`[/api/live] ${name} stream error (retry in ${delay}ms):`, err);
              if (!isReset) break; // non-transient — propagate by breaking
              await new Promise<void>((r) => setTimeout(r, delay));
              delay = Math.min(delay * 2, 30_000);
            }
          }
        };

        // Ingest odds stream in the background.
        withRetry("odds", () => streamOdds(auth, fixtureId, abort.signal));

        // Ingest scores stream in the background.
        withRetry("scores", () => streamScores(auth, fixtureId, abort.signal));

        // Signal the browser we're connected and in live mode — the badge
        // switches to "live · TxLINE" even during pre-match wait.
        sendEvent("connected", { fixtureId: fixtureId ?? null });

        // 3. Drain the queue, keep the SSE alive with periodic comments.
        const state = initState(fixtureId ?? "live");
        const keepaliveMs = 20_000;

        while (!cancelled) {
          if (queue.length === 0) {
            await Promise.race([
              new Promise<void>((r) => { wakeResolve = r; }),
              new Promise<void>((r) => setTimeout(r, keepaliveMs)),
            ]);
            keepalive();
          }
          const events = queue.splice(0);
          events.sort((a, b) => a.ts - b.ts);
          for (const ev of events) {
            if (cancelled) break;
            const frame = step(state, ev);
            send(frame);
          }
        }

        abort.abort();
      };

      run().catch((err) => {
        console.error("[/api/live] fatal:", err);
        // Invalidate cached token on auth errors so next request re-activates.
        if (String(err).includes("token") || String(err).includes("activate")) {
          cachedApiToken = null;
        }
        if (cancelled) return;
        try {
          send({ error: String(err) });
          controller.close();
        } catch { /* client already disconnected */ }
      });
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
