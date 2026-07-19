/**
 * Offline replay generator (run explicitly, skipped by the normal test suite):
 *
 *   BUILD_REPLAYS=1 npx vitest run scripts/gen-replays.test.ts
 *
 * Fetches each candidate finished fixture's REAL odds + scores history from
 * TxLINE, runs it through the anticipation engine, and writes a compact replay
 * JSON into `public/replays/<fixtureId>.json` (+ an index). Also prints the
 * "how the model called it" evidence for every goal so we can verify Foresight
 * flagged the surge before the market repriced.
 */

import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { guestStart, fetchFixtureHistory, type TxlineAuth } from "@/lib/txline/client";
import { buildReplay, type Replay } from "@/lib/replay/build";
import { FIXTURES } from "@/lib/schedule";

// Candidate finished fixtures to pre-render (most dramatic / recent first).
const CANDIDATES = [
  "18257739", // Spain v Argentina — Final
  "18257865", // France v England — Semi-final
  "18175918", // Argentina v Cape Verde — R32 (known-good, 3–2, ET+pens)
  "18179764", // England v Congo DR — R32
  "18175981", // France v Sweden — R32
  "18172469", // Brazil v Japan — R32
];

function loadToken(): string {
  for (const p of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(process.cwd(), p), "utf-8").split("\n")) {
        const m = /^\s*TXLINE_API_TOKEN\s*=\s*(.*)\s*$/.exec(line);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    } catch {}
  }
  return process.env.TXLINE_API_TOKEN ?? "";
}

describe("generate past-match replays from real TxLINE history", () => {
  it.skipIf(!process.env.BUILD_REPLAYS)(
    "fetches, replays, and writes public/replays/*.json",
    async () => {
      const apiToken = loadToken();
      expect(apiToken, "TXLINE_API_TOKEN must be set in .env.local").toBeTruthy();

      const jwt = await guestStart();
      const auth: TxlineAuth = { jwt, apiToken };

      const outDir = join(process.cwd(), "public", "replays");
      mkdirSync(outDir, { recursive: true });

      const index: Array<{
        fixtureId: string; home: string; away: string; round: string;
        finalHome: number; finalAway: number; durationMin: number;
        goals: number; calledGoals: number; peakAnticipation: number;
      }> = [];

      for (const fixtureId of CANDIDATES) {
        const fx = FIXTURES.find((f) => f.fixtureId === fixtureId);
        if (!fx) { console.log(`\n[skip] ${fixtureId} not in schedule`); continue; }
        const kickoffTs = Date.parse(`${fx.date}T${fx.time}:00Z`);
        const startTs = kickoffTs - 12 * 60_000;
        const endTs = kickoffTs + 170 * 60_000;

        console.log(`\n──────── ${fx.home} v ${fx.away} (${fx.round}) · ${fixtureId} ────────`);
        let hist;
        try {
          hist = await fetchFixtureHistory(auth, fixtureId, startTs, endTs, { concurrency: 8 });
        } catch (e) {
          console.log(`  [error] ${(e as Error).message}`);
          continue;
        }
        console.log(`  events: ${hist.events.length}  (odds ${hist.oddsCount}, scores ${hist.scoreCount})`);
        if (hist.events.length < 20) { console.log("  [skip] too little data — likely not played / retained"); continue; }

        const replay: Replay = buildReplay(
          { fixtureId, home: fx.home, away: fx.away, round: fx.round, kickoffTs },
          hist.events,
        );

        console.log(`  final: ${replay.home} ${replay.finalHome}–${replay.finalAway} ${replay.away}` +
          ` · duration ${(replay.durationSec / 60).toFixed(0)}'  · peak anticipation ${replay.peakAnticipation}` +
          ` · frames ${replay.frames.length}`);
        for (const g of replay.goals) {
          const mm = Math.floor(g.clockSeconds / 60);
          const who = g.side === "home" ? replay.home : replay.away;
          console.log(
            `   ⚽ ${String(mm).padStart(2, "0")}' ${who} → ${g.homeScore}-${g.awayScore}  ` +
            (g.calledIt
              ? `✅ CALLED IT: brewing ${g.leadSeconds}s before (peak ${g.peakAnticipation}), market ${g.marketAtBrew}%→${g.marketAfter}% after`
              : `— not flagged (peak ant ${g.peakAnticipation})`),
          );
        }

        writeFileSync(join(outDir, `${fixtureId}.json`), JSON.stringify(replay));
        const calledGoals = replay.goals.filter((g) => g.calledIt).length;
        index.push({
          fixtureId, home: fx.home, away: fx.away, round: fx.round,
          finalHome: replay.finalHome, finalAway: replay.finalAway,
          durationMin: Math.round(replay.durationSec / 60),
          goals: replay.goals.length, calledGoals, peakAnticipation: replay.peakAnticipation,
        });
      }

      index.sort((a, b) => b.calledGoals - a.calledGoals || b.goals - a.goals);
      writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
      console.log(`\n✔ wrote ${index.length} replays → public/replays/  (index.json)`);
      expect(index.length).toBeGreaterThan(0);
    },
    600_000,
  );
});
