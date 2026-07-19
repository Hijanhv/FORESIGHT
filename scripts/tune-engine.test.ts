/**
 * Engine tuning harness (run explicitly, skipped by the normal suite):
 *
 *   BUILD_REPLAYS=1 npx vitest run scripts/tune-engine.test.ts
 *
 * Caches each fixture's REAL normalized event stream to a scratch dir, then
 * scores candidate EngineParams by honest precision/recall:
 *   recall    = goals for which the scoring side was "brewing" in the 3 min before
 *   precision = brewing spells that were actually resolved by that side scoring
 * The point is NOT to maximise recall (corners+cards are a weak signal and many
 * goals have no pre-signal) — it's to pick params that fire on the genuinely
 * pressured goals without brewing constantly.
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { guestStart, fetchFixtureHistory, type TxlineAuth } from "@/lib/txline/client";
import { FIXTURES } from "@/lib/schedule";
import { runEngine, DEFAULT_PARAMS, REAL_PARAMS, type EngineParams } from "@/lib/engine";
import type { UnifiedEvent, ForesightFrame, Side } from "@/types/foresight";

const CANDIDATES = ["18257865", "18175918", "18179764", "18175981", "18172469"];
// Cache fetched event streams between sweeps (portable temp dir).
const CACHE = join(tmpdir(), "foresight-tune-events");

function loadToken(): string {
  for (const p of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(process.cwd(), p), "utf-8").split("\n")) {
        const m = /^\s*TXLINE_API_TOKEN\s*=\s*(.*)\s*$/.exec(line);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    } catch {}
  }
  return "";
}

async function eventsFor(auth: TxlineAuth, fixtureId: string): Promise<UnifiedEvent[]> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${fixtureId}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf-8")) as UnifiedEvent[];
  const fx = FIXTURES.find((f) => f.fixtureId === fixtureId)!;
  const kickoffTs = Date.parse(`${fx.date}T${fx.time}:00Z`);
  const hist = await fetchFixtureHistory(auth, fixtureId, kickoffTs - 12 * 60_000, kickoffTs + 170 * 60_000, {
    concurrency: 8,
  });
  writeFileSync(file, JSON.stringify(hist.events));
  return hist.events;
}

const LEAD_MAX = 180_000; // a "called" goal: brewing within 3 min before it
const FOLLOW = 180_000; // a brewing spell "pays off" if that side scores within 3 min after it ends

interface Score { goals: number; called: number; spells: number; goodSpells: number; leadSecs: number[] }

function scoreMatch(frames: ForesightFrame[]): Score {
  const s: Score = { goals: 0, called: 0, spells: 0, goodSpells: 0, leadSecs: [] };
  // goal timestamps per side
  const goals: Array<{ ts: number; side: Side }> = [];
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].homeScore > frames[i - 1].homeScore) goals.push({ ts: frames[i].ts, side: "home" });
    if (frames[i].awayScore > frames[i - 1].awayScore) goals.push({ ts: frames[i].ts, side: "away" });
  }
  s.goals = goals.length;

  // brewing spells: maximal contiguous runs of brewing for a given side
  const spells: Array<{ side: Side; startTs: number; endTs: number }> = [];
  let cur: { side: Side; startTs: number; endTs: number } | null = null;
  for (const f of frames) {
    if (f.brewing && f.brewingSide) {
      if (cur && cur.side === f.brewingSide) cur.endTs = f.ts;
      else { if (cur) spells.push(cur); cur = { side: f.brewingSide, startTs: f.ts, endTs: f.ts }; }
    } else if (cur) { spells.push(cur); cur = null; }
  }
  if (cur) spells.push(cur);
  s.spells = spells.length;

  for (const g of goals) {
    const hit = spells.find((sp) => sp.side === g.side && sp.endTs <= g.ts && g.ts - sp.startTs <= LEAD_MAX);
    if (hit) { s.called++; s.leadSecs.push(Math.round((g.ts - hit.startTs) / 1000)); }
  }
  for (const sp of spells) {
    const paid = goals.some((g) => g.side === sp.side && g.ts >= sp.startTs && g.ts - sp.endTs <= FOLLOW);
    if (paid) s.goodSpells++;
  }
  return s;
}

describe("tune engine on real replays", () => {
  it.skipIf(!process.env.BUILD_REPLAYS)(
    "sweeps params and prints honest precision/recall",
    async () => {
      const auth: TxlineAuth = { jwt: await guestStart(), apiToken: loadToken() };
      const streams: Record<string, UnifiedEvent[]> = {};
      for (const id of CANDIDATES) streams[id] = await eventsFor(auth, id);

      const base = { ...DEFAULT_PARAMS };
      const sets: Array<{ name: string; p: EngineParams }> = [
        { name: "DEFAULT (synthetic)", p: DEFAULT_PARAMS },
        { name: "C no-sustain (ref)", p: { ...base, brewThreshold: 0.40, brewMinPressure: 0.35, pressureTauMs: 240_000, pressureScale: 1.6, cornerWeight: 1.2 } },
        { name: "F sustain20 thr.40 sc1.7", p: { ...base, brewThreshold: 0.40, brewMinPressure: 0.36, pressureTauMs: 240_000, pressureScale: 1.7, cornerWeight: 1.2, brewSustainMs: 20_000 } },
        { name: "REAL_PARAMS (sustain30)", p: REAL_PARAMS },
        { name: "G sustain45 thr.42 sc1.7", p: { ...base, brewThreshold: 0.42, brewMinPressure: 0.38, pressureTauMs: 240_000, pressureScale: 1.7, cornerWeight: 1.2, brewSustainMs: 45_000 } },
        { name: "H sustain60 thr.40 sc1.6", p: { ...base, brewThreshold: 0.40, brewMinPressure: 0.36, pressureTauMs: 300_000, pressureScale: 1.6, cornerWeight: 1.3, brewSustainMs: 60_000 } },
      ];

      console.log("\nparams".padEnd(30), "goals  called(recall)  spells  good(precision)  medianLead");
      for (const { name, p } of sets) {
        const tot: Score = { goals: 0, called: 0, spells: 0, goodSpells: 0, leadSecs: [] };
        for (const id of CANDIDATES) {
          const sc = scoreMatch(runEngine(streams[id], p));
          tot.goals += sc.goals; tot.called += sc.called; tot.spells += sc.spells; tot.goodSpells += sc.goodSpells;
          tot.leadSecs.push(...sc.leadSecs);
        }
        const recall = tot.goals ? ((tot.called / tot.goals) * 100).toFixed(0) : "0";
        const precision = tot.spells ? ((tot.goodSpells / tot.spells) * 100).toFixed(0) : "—";
        const med = tot.leadSecs.length ? tot.leadSecs.sort((a, b) => a - b)[Math.floor(tot.leadSecs.length / 2)] : 0;
        console.log(
          name.padEnd(30),
          `${tot.goals}      ${tot.called} (${recall}%)`.padEnd(18),
          `${tot.spells}`.padEnd(7),
          `${tot.goodSpells} (${precision}%)`.padEnd(16),
          `${med}s`,
        );
      }
      expect(Object.keys(streams).length).toBeGreaterThan(0);
    },
    600_000,
  );
});
