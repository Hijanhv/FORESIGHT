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

      const run = async () => {
        // 1. Authenticate with TxLINE (free World Cup tier: service level 1).
        const jwt = await guestStart();
        const proof = await buildWalletProof(jwt, { serviceLevelId: 12, durationWeeks: 4 });
        const apiToken = await activateToken(jwt, {
          txSig: proof.txSig,
          walletSignature: proof.walletSignature,
          leagues: proof.leagues,
        });
        const auth = { jwt, apiToken };

        // 2. Merge odds and scores into one ordered channel via an async queue.
        const queue: UnifiedEvent[] = [];
        let resolve: (() => void) | null = null;

        const enqueue = (ev: UnifiedEvent) => {
          queue.push(ev);
          resolve?.();
          resolve = null;
        };

        const abort = new AbortController();

        // Ingest odds stream in the background.
        (async () => {
          try {
            for await (const tick of streamOdds(auth, fixtureId, abort.signal)) {
              enqueue(tick);
            }
          } catch { /* stream closed */ }
        })();

        // Ingest scores stream in the background.
        (async () => {
          try {
            for await (const ev of streamScores(auth, fixtureId, abort.signal)) {
              enqueue(ev);
            }
          } catch { /* stream closed */ }
        })();

        // 3. Drain the queue and run the engine.
        const state = initState(fixtureId ?? "live");

        while (!cancelled) {
          if (queue.length === 0) {
            // Wait for the next event.
            await new Promise<void>((r) => { resolve = r; });
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
