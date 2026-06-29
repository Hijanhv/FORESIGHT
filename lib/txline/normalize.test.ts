import { describe, expect, it } from "vitest";
import { GamePhase, StatKey } from "@/types/foresight";
import { normalizeOdds, normalizeScore } from "@/lib/txline/normalize";
import type { RawOddsPayload, RawScorePayload } from "@/lib/txline/types";

// TxLINE sends Pct as percentage strings (e.g. "45.00"), not fractions.
const baseOdds: RawOddsPayload = {
  FixtureId: 123,
  Ts: 1_750_000_000_000,
  MessageId: "m1",
  Bookmaker: "consensus",
  BookmakerId: 0,
  InRunning: true,
  SuperOddsType: "1X2",
  MarketParameters: "",
  MarketPeriod: "FullTime",
  GameState: "1H",
  PriceNames: ["1", "X", "2"],
  Prices: [220, 340, 300],
  Pct: ["45.00", "27.00", "28.00"],
};

describe("normalizeOdds", () => {
  it("converts percentage Pct values to 0–1 fractions", () => {
    expect(normalizeOdds(baseOdds)).toEqual({
      kind: "odds",
      fixtureId: "123",
      ts: 1_750_000_000_000,
      homeProb: 0.45,
      drawProb: 0.27,
      awayProb: 0.28,
      inRunning: true,
    });
  });

  it("skips payloads with NA prices", () => {
    expect(normalizeOdds({ ...baseOdds, Pct: ["NA", "27.00", "28.00"] })).toBeNull();
  });

  it("skips non-1X2 markets", () => {
    expect(normalizeOdds({ ...baseOdds, PriceNames: ["1", "2"] })).toBeNull();
  });
});

describe("normalizeScore", () => {
  const base: RawScorePayload = {
    FixtureId: 123,
    Seq: 5,
    Confirmed: true,
    StatusId: GamePhase.FirstHalf,
    Ts: 1_750_000_100_000,
    Action: "Goal",
    Clock: { Running: true, Seconds: 2160 },
    Participant: 1,
    Stats: { "1": 1, "2": 0, "7": 2, "8": 1 },
  };

  it("maps a home goal to GoalHome with correct phase/clock/snapshot", () => {
    const ev = normalizeScore(base);
    expect(ev.kind).toBe("score");
    expect(ev.fixtureId).toBe("123");
    expect(ev.seq).toBe(5);
    expect(ev.ts).toBe(1_750_000_100_000);
    expect(ev.confirmed).toBe(true);
    expect(ev.statKey).toBe(StatKey.GoalHome);
    expect(ev.action).toBe("Goal");
    expect(ev.phase).toBe(GamePhase.FirstHalf);
    expect(ev.clockSeconds).toBe(2160);
    expect(ev.snapshot).toEqual({ homeScore: 1, awayScore: 0 });
  });

  it("maps an away corner to CornerAway", () => {
    const ev = normalizeScore({ ...base, Action: "Corner", Participant: 2 });
    expect(ev.statKey).toBe(StatKey.CornerAway);
  });

  it("emits statKey 0 for unrecognized actions (phase/clock still update)", () => {
    const ev = normalizeScore({ ...base, Action: "throw_in" });
    expect(ev.statKey).toBe(0);
    expect(ev.clockSeconds).toBe(2160);
    expect(ev.phase).toBe(GamePhase.FirstHalf);
  });

  it("emits statKey 0 when participant is absent", () => {
    const ev = normalizeScore({ ...base, Participant: undefined });
    expect(ev.statKey).toBe(0);
  });

  it("handles missing Stats gracefully", () => {
    const ev = normalizeScore({ ...base, Stats: undefined });
    expect(ev.snapshot).toBeUndefined();
  });
});
