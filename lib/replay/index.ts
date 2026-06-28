/**
 * Replay harness (Phase 2).
 *
 * Feeds an ordered `UnifiedEvent` stream through the anticipation engine. Because
 * the engine is deterministic, a recorded `logs/events.jsonl` and a live feed
 * are interchangeable — this is what lets us demo "foresight" on demand against a
 * real World Cup moment instead of waiting for one to happen live.
 */

import type { ForesightFrame, UnifiedEvent } from "@/types/foresight";
import {
  DEFAULT_PARAMS,
  EngineParams,
  EngineState,
  initState,
  step,
} from "@/lib/engine";

export interface ReplayOptions {
  params?: EngineParams;
  /** Wall-clock speed-up. 1 = real time, 60 = a minute per second, 0/Infinity = instant. */
  speed?: number;
  /** Called for every frame as it is produced. */
  onFrame?: (frame: ForesightFrame, event: UnifiedEvent) => void;
  /** Sleep impl (injectable for tests). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/** Parse a `logs/events.jsonl` body into an ordered event array. */
export function parseEventsJsonl(body: string): UnifiedEvent[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as UnifiedEvent)
    .sort((a, b) => a.ts - b.ts);
}

/** Synchronous, instant replay — returns every frame. Ideal for tests and tuning. */
export function replaySync(
  events: UnifiedEvent[],
  params: EngineParams = DEFAULT_PARAMS,
): ForesightFrame[] {
  const state = initState(events[0]?.fixtureId ?? "");
  return events.map((e) => step(state, e, params));
}

/** Time-faithful replay — paces frames by the gap between event timestamps. */
export async function replay(
  events: UnifiedEvent[],
  opts: ReplayOptions = {},
): Promise<ForesightFrame[]> {
  const params = opts.params ?? DEFAULT_PARAMS;
  const speed = opts.speed ?? 60;
  const sleep = opts.sleep ?? defaultSleep;
  const state: EngineState = initState(events[0]?.fixtureId ?? "");
  const frames: ForesightFrame[] = [];

  let prevTs: number | null = null;
  for (const ev of events) {
    if (prevTs != null && speed > 0 && Number.isFinite(speed)) {
      const waitMs = (ev.ts - prevTs) / speed;
      if (waitMs > 0) await sleep(waitMs);
    }
    prevTs = ev.ts;
    const f = step(state, ev, params);
    frames.push(f);
    opts.onFrame?.(f, ev);
  }
  return frames;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
