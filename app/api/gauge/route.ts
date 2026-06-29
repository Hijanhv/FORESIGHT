import { GamePhase } from "@/types/foresight";
import { replay } from "@/lib/replay";
import { generateSyntheticMatch } from "@/lib/replay/synthetic";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    start(controller) {
      const run = async () => {
        while (!cancelled) {
          const events = generateSyntheticMatch({ startTs: Date.now() });
          const startTs = events[0].ts;

          await replay(events, {
            speed: 60,
            onFrame: (frame, event) => {
              if (cancelled) return;
              try {
                const clockSec = Math.round((event.ts - startTs) / 1000);
                const phase =
                  frame.phase === GamePhase.NotStarted
                    ? clockSec < 45 * 60
                      ? GamePhase.FirstHalf
                      : GamePhase.SecondHalf
                    : frame.phase;
                const payload = { ...frame, clockSeconds: clockSec, phase };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
                );
              } catch {
                cancelled = true;
              }
            },
          });
        }
      };
      run().catch(() => {});
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
