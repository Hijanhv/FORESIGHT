import { describe, expect, it } from "vitest";
import { GamePhase, StatKey } from "@/types/foresight";
import { normalizeOdds, normalizeScore } from "@/lib/txline/normalize";
import type { RawOddsPayload, RawScorePayload } from "@/lib/txline/types";

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
  Pct: ["0.450", "0.270", "0.280"],
};

describe("normalizeOdds", () => {
  it("maps a 1X2 payload to a normalized odds tick", () => {
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
    expect(normalizeOdds({ ...baseOdds, Pct: ["NA", "0.270", "0.280"] })).toBeNull();
  });
});

describe("normalizeScore", () => {
  const base: RawScorePayload = {
    fixtureId: 123,
    seq: 5,
    confirmed: true,
    statusId: GamePhase.FirstHalf,
    ts: 1_750_000_100_000,
    action: "Goal",
    clock: { running: true, seconds: 2160 },
    participant: 1,
  };

  it("maps a home goal to GoalHome with the right phase/clock", () => {
    expect(normalizeScore(base)).toEqual({
      kind: "score",
      fixtureId: "123",
      seq: 5,
      ts: 1_750_000_100_000,
      confirmed: true,
      statKey: StatKey.GoalHome,
      action: "add",
      phase: GamePhase.FirstHalf,
      clockSeconds: 2160,
    });
  });

  it("maps an away corner to CornerAway", () => {
    const ev = normalizeScore({ ...base, action: "Corner", participant: 2 });
    expect(ev?.statKey).toBe(StatKey.CornerAway);
  });

  it("returns null for unrecognized actions", () => {
    expect(normalizeScore({ ...base, action: "Pass" })).toBeNull();
  });
});
