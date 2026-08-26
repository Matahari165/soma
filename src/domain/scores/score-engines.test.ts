import { describe, expect, it } from "vitest";

import { calculateEffortScore, calculateEffortScoreFromAvailable, diminishingLoad } from "./effort";
import { calculateRecoveryScore } from "./recovery";
import { circularMean, sleepRegularityScore } from "./regularity";
import { estimateSleepNeed, recommendBedtime } from "./sleep-need";

describe("score engines", () => {
  it("keeps the personal sleep target fixed across debt and effort contexts", () => {
    const result = estimateSleepNeed({ baseTargetMinutes: 510, recentSleepMinutes: [360, 390, 420, 430, 440, 450, 460], priorDayEffort: 90 });
    expect(result.estimatedNeedMinutes).toBe(510);
    expect(result.sleepDebtAdjustment).toBe(0);
    expect(result.effortAdjustment).toBe(0);
  });

  it("handles bedtimes around midnight as adjacent times", () => {
    expect(circularMean([23 * 60 + 50, 10])).toBeLessThan(20);
    expect(sleepRegularityScore([
      { bedtimeMinutes: 23 * 60 + 50, wakeMinutes: 430 },
      { bedtimeMinutes: 10, wakeMinutes: 440 },
      { bedtimeMinutes: 5, wakeMinutes: 435 },
    ])).toBeGreaterThan(90);
  });

  it("limits bedtime movement to protect regularity", () => {
    const result = recommendBedtime({ wakeTime: "07:00", sleepNeedMinutes: 540, recentEfficiencyPercent: 85, regularBedtimeMinutes: 23 * 60, windDownMinutes: 30 });
    expect(Math.abs(result.bedtimeMinutes - 23 * 60)).toBeLessThanOrEqual(45);
  });

  it("withholds recovery when personal history is insufficient", () => {
    expect(calculateRecoveryScore({ currentHrv: 50, hrvBaseline: [48, 49], currentRestingHeartRate: 58, restingHeartRateBaseline: [60, 59], sleepScore: 80 }).score).toBeNull();
  });

  it("scores recovery from personal baselines", () => {
    const result = calculateRecoveryScore({ currentHrv: 55, hrvBaseline: [45, 46, 47, 48, 49, 50, 51], currentRestingHeartRate: 56, restingHeartRateBaseline: [62, 61, 60, 59, 60, 61, 62], sleepScore: 85 });
    expect(result.score).toBeGreaterThan(70);
  });

  it("calculates accomplished load without a prescriptive target", () => {
    const effort = calculateEffortScore({ zoneMinutes: 45, activeEnergyKcal: 400, exerciseMinutes: 50, steps: 8000 });
    expect(effort.score).toBeGreaterThan(0);
    expect(effort.algorithmVersion).toBe("effort-v3");
  });

  it("does not convert missing activity into a zero effort score", () => {
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: null, activeEnergyKcal: null, exerciseMinutes: null, steps: null })).toMatchObject({ score: null, coverage: 0 });
  });

  it("preserves a measured zero when activity inputs are complete", () => {
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: 0, activeEnergyKcal: 0, exerciseMinutes: 0, steps: 0 })).toMatchObject({ score: 0, coverage: 1 });
  });

  it("withholds effort when only one activity input is present", () => {
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: null, activeEnergyKcal: null, exerciseMinutes: null, steps: 4_000 }).score).toBeNull();
  });

  it("normalizes a sufficiently covered score without turning absent components into zero", () => {
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: 75, activeEnergyKcal: null, exerciseMinutes: null, steps: 12_000 })).toMatchObject({ score: 50, coverage: 0.5 });
  });

  it("keeps adding accomplished load above each reference with diminishing returns", () => {
    expect(diminishingLoad(12_000, 12_000)).toBeCloseTo(.5);
    expect(diminishingLoad(24_000, 12_000)).toBeCloseTo(.75);
    expect(diminishingLoad(36_000, 12_000)).toBeCloseTo(.875);
    const reference = calculateEffortScore({ zoneMinutes: 75, activeEnergyKcal: 700, exerciseMinutes: 60, steps: 12_000 });
    const doubled = calculateEffortScore({ zoneMinutes: 150, activeEnergyKcal: 1_400, exerciseMinutes: 120, steps: 24_000 });
    expect(reference).toMatchObject({ score: 50, algorithmVersion: "effort-v3" });
    expect(doubled.score).toBe(75);
  });
});
