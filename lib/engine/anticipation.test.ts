import { describe, expect, it } from "vitest";
import { runEngine } from "@/lib/engine";
import { generateSyntheticMatch, SYNTHETIC_GOAL_AT_SEC } from "@/lib/replay/synthetic";

describe("anticipation engine", () => {
  const events = generateSyntheticMatch();
  const frames = runEngine(events);

  it("is deterministic — same stream, same frames", () => {
    expect(runEngine(generateSyntheticMatch())).toEqual(frames);
  });

  it("flags brewing on the home side BEFORE the goal is scored", () => {
    const preGoal = frames.filter((f) => f.clockSeconds < SYNTHETIC_GOAL_AT_SEC);
    const brewing = preGoal.filter((f) => f.brewing && f.brewingSide === "home");
    expect(brewing.length).toBeGreaterThan(0);
    // and the earliest brewing happens during the corner barrage, not at kickoff
    expect(brewing[0].clockSeconds).toBeGreaterThan(33 * 60);
  });

  it("anticipation climbs into the goal, then collapses once it lands", () => {
    const justBefore = frames
      .filter((f) => f.clockSeconds < SYNTHETIC_GOAL_AT_SEC)
      .at(-1)!;
    const last = frames.at(-1)!;
    expect(justBefore.anticipation).toBeGreaterThan(0.5);
    // goal resets home pressure → no longer brewing afterwards
    expect(last.brewing).toBe(false);
  });

  it("keeps probabilities and momentum in range", () => {
    for (const f of frames) {
      expect(f.anticipation).toBeGreaterThanOrEqual(0);
      expect(f.anticipation).toBeLessThanOrEqual(1);
      expect(Math.abs(f.momentum)).toBeLessThanOrEqual(1);
      expect(f.homeProb + f.drawProb + f.awayProb).toBeGreaterThan(0);
    }
  });
});
