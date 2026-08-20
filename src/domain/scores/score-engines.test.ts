import { describe, expect, it } from "vitest";

import { calculateEffortScore, calculateEffortScoreFromAvailable, calculateEffortTarget } from "./effort";
import { calculateRecoveryScore } from "./recovery";
import { circularMean, sleepRegularityScore } from "./regularity";
import { estimateSleepNeed, recommendBedtime } from "./sleep-need";

describe("score engines", () => {
  it("raises sleep need within bounded adjustments", () => {
    const result = estimateSleepNeed({ baseTargetMinutes: 480, recentSleepMinutes: [360, 390, 420, 430, 440, 450, 460], priorDayEffort: 90 });
    expect(result.estimatedNeedMinutes).toBeGreaterThan(480);
    expect(result.sleepDebtAdjustment).toBeLessThanOrEqual(60);
    expect(result.effortAdjustment).toBeLessThanOrEqual(30);
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

  it("keeps raw effort separate from the goal target", () => {
    const effort = calculateEffortScore({ zoneMinutes: 45, activeEnergyKcal: 400, exerciseMinutes: 50, steps: 8000 });
    const target = calculateEffortTarget({ goal: "build_muscle", recoveryScore: 72, weeklyEffortSoFar: 240, daysRemainingIncludingToday: 3 });
    expect(effort.score).toBeGreaterThan(0);
    expect(target.minimum).toBeLessThan(target.maximum);
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
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: 75, activeEnergyKcal: null, exerciseMinutes: null, steps: 12_000 })).toMatchObject({ score: 100, coverage: 0.5 });
  });
});
