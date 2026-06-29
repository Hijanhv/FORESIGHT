/**
 * Log-writer route — streams live TxLINE events AND appends each normalized
 * UnifiedEvent as a JSON line to `logs/<fixtureId>.jsonl`.
 *
 * The resulting file is the input to `lib/replay` — so a recorded World Cup
 * moment can be replayed on demand against the same engine, exactly as it
 * happened. Use it to tune engine params or demo "feel a goal coming" with
 * a real historical sequence.
 *
 * Usage:  GET /api/record?fixtureId=<id>
 *
 * The response is an SSE stream of the same ForesightFrames as /api/live,
 * so the gauge can optionally subscribe here while recording.
 *
 * Requires TXLINE_* and WALLET_KEYPAIR_PATH env vars (same as /api/live).
 */

import fs from "node:fs";
import path from "node:path";
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

function openLogWriter(fixtureId: string): fs.WriteStream {
  const logsDir = path.join(process.cwd(), "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const file = path.join(logsDir, `${fixtureId}.jsonl`);
  return fs.createWriteStream(file, { flags: "a" });
}

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return new Response("TxLINE env vars not set.", { status: 503 });
  }

  const fixtureId = request.nextUrl.searchParams.get("fixtureId");
  if (!fixtureId) {
    return new Response("fixtureId query param required.", { status: 400 });
  }

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
        const logWriter = openLogWriter(fixtureId);

        const writeEvent = (ev: UnifiedEvent) => {
          logWriter.write(JSON.stringify(ev) + "\n");
        };

        const jwt = await guestStart();
        const proof = await buildWalletProof(jwt, { serviceLevelId: 12, durationWeeks: 4 });
        const apiToken = await activateToken(jwt, {
          txSig: proof.txSig,
          walletSignature: proof.walletSignature,
          leagues: proof.leagues,
        });
        const auth = { jwt, apiToken };

        const queue: UnifiedEvent[] = [];
        let resolve: (() => void) | null = null;
        const enqueue = (ev: UnifiedEvent) => {
          queue.push(ev);
          resolve?.();
          resolve = null;
        };

        const abort = new AbortController();

        (async () => {
          try {
            for await (const tick of streamOdds(auth, fixtureId, abort.signal)) {
              enqueue(tick);
            }
          } catch { /* closed */ }
        })();

        (async () => {
          try {
            for await (const ev of streamScores(auth, fixtureId, abort.signal)) {
              enqueue(ev);
            }
          } catch { /* closed */ }
        })();

        const state = initState(fixtureId);

        while (!cancelled) {
          if (queue.length === 0) {
            await new Promise<void>((r) => { resolve = r; });
          }
          const events = queue.splice(0);
          events.sort((a, b) => a.ts - b.ts);
          for (const ev of events) {
            if (cancelled) break;
            writeEvent(ev);
            const frame = step(state, ev);
            send(frame);
          }
        }

        abort.abort();
        logWriter.end();
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
