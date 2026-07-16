/**
 * Regression tests against a REAL World Cup stream (Argentina v Cape Verde,
 * Round of 32 — went to extra time + penalties). The captured score events live
 * in `__fixtures__/real-scores-18175918.json`. Final result: 3–2, corners 8–8,
 * a yellow each. These tests pin the normalize → engine pipeline against reality
 * so the live demo can't silently regress.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeOdds, normalizeScore } from "./normalize";
import type { RawOddsPayload, RawScorePayload } from "./types";
import { initState, step } from "@/lib/engine";
import type { ForesightFrame } from "@/types/foresight";

const raw = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "real-scores-18175918.json"), "utf-8"),
) as RawScorePayload[];

describe("real World Cup score stream → engine", () => {
  const frames: ForesightFrame[] = [];
  const state = initState("18175918");
  for (const p of raw) {
    frames.push(step(state, normalizeScore(p)));
  }
  const last = frames[frames.length - 1];

  it("ends on the true final score and stats (3–2, corners 8–8, a yellow each)", () => {
    expect(last.homeScore).toBe(3);
    expect(last.awayScore).toBe(2);
    expect(last.stats.homeCorners).toBe(8);
    expect(last.stats.awayCorners).toBe(8);
    expect(last.stats.homeYellows).toBe(1);
    expect(last.stats.awayYellows).toBe(1);
    expect(last.stats.homeReds).toBe(0);
    expect(last.stats.awayReds).toBe(0);
  });

  it("never lets the score go backwards (regression: empty Stats {} must not zero it)", () => {
    let maxHome = 0;
    let maxAway = 0;
    for (const f of frames) {
      expect(f.homeScore).toBeGreaterThanOrEqual(maxHome);
      expect(f.awayScore).toBeGreaterThanOrEqual(maxAway);
      maxHome = f.homeScore;
      maxAway = f.awayScore;
    }
  });

  it("accumulates corners monotonically up to the final totals", () => {
    let maxHC = 0;
    let maxAC = 0;
    for (const f of frames) {
      expect(f.stats.homeCorners).toBeGreaterThanOrEqual(maxHC);
      expect(f.stats.awayCorners).toBeGreaterThanOrEqual(maxAC);
      maxHC = f.stats.homeCorners;
      maxAC = f.stats.awayCorners;
    }
  });

  it("produces non-zero anticipation during play (engine actually reacts to real pressure)", () => {
    const peak = Math.max(...frames.map((f) => f.anticipation));
    expect(peak).toBeGreaterThan(0.2);
  });

  it("flashes real pitch events (goals/corners surfaced to the UI)", () => {
    const kinds = new Set(frames.map((f) => f.lastEvent?.kind).filter(Boolean));
    expect(kinds.has("goal")).toBe(true);
    expect(kinds.has("corner")).toBe(true);
  });
});

describe("real Asian Handicap odds → normalizeOdds", () => {
  // Verbatim shapes from GET /api/odds/snapshot/18257865 (France v England).
  const level: RawOddsPayload = {
    FixtureId: 18257865,
    Ts: 1784229332386,
    MessageId: "x",
    Bookmaker: "TXLineStablePriceDemargined",
    BookmakerId: 10021,
    InRunning: false,
    SuperOddsType: "ASIANHANDICAP_PARTICIPANT_GOALS",
    MarketParameters: "line=0",
    MarketPeriod: "",
    GameState: "",
    PriceNames: ["part1", "part2"],
    Prices: [1482, 3077],
    Pct: ["67.476", "32.499"],
  };
  const handicapLine: RawOddsPayload = { ...level, MarketParameters: "line=-1", Pct: ["37.175", "62.814"] };
  const naLine: RawOddsPayload = { ...level, MarketParameters: "line=-1.25", Pct: ["NA", "NA"] };

  it("reads the level (line=0) market as draw-no-bet win probability", () => {
    const tick = normalizeOdds(level, true)!;
    expect(tick).not.toBeNull();
    expect(tick.homeProb).toBeCloseTo(0.67476, 4);
    expect(tick.awayProb).toBeCloseTo(0.32499, 4);
    expect(tick.drawProb).toBe(0);
  });

  it("respects Participant1IsHome=false by swapping sides", () => {
    const tick = normalizeOdds(level, false)!;
    expect(tick.homeProb).toBeCloseTo(0.32499, 4);
    expect(tick.awayProb).toBeCloseTo(0.67476, 4);
  });

  it("ignores non-level handicap lines and NA prices", () => {
    expect(normalizeOdds(handicapLine, true)).toBeNull();
    expect(normalizeOdds(naLine, true)).toBeNull();
  });
});
