import { describe, expect, it } from "vitest";

import {
  calculateEffortScore,
  calculateEffortScoreFromAvailable,
  DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET,
  diminishingLoad,
  effortScoreTargets,
  EFFORT_STEPS_TARGET,
  resolveActiveEnergyKcalTarget,
} from "./effort";
import { calculateRecoveryScore } from "./recovery";
import { circularMean, sleepRegularityScore } from "./regularity";
import { estimateSleepNeed, recommendBedtime, recommendBedtimeFromAwake, recommendBedtimeFromHistory } from "./sleep-need";

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

  it("keeps a current post-midnight bedtime close to a pre-midnight reference", () => {
    expect(sleepRegularityScore([
      { bedtimeMinutes: 23 * 60 + 45, wakeMinutes: 420 },
      { bedtimeMinutes: 23 * 60 + 45, wakeMinutes: 420 },
      { bedtimeMinutes: 15, wakeMinutes: 420 },
    ])).toBe(88);
  });

  it("uses regularity when it can still protect the sleep target", () => {
    const result = recommendBedtime({ wakeTime: "07:00", sleepNeedMinutes: 450, recentEfficiencyPercent: 100, regularBedtimeMinutes: 22 * 60, windDownMinutes: 30 });
    expect(Math.abs(result.bedtimeMinutes - 23 * 60)).toBeLessThanOrEqual(45);
    expect(result.timeInBedMinutes).toBeGreaterThanOrEqual(result.sleepNeedMinutes);
  });

  it("never shifts bedtime later when regularity would miss the target", () => {
    const result = recommendBedtime({ wakeTime: "07:00", sleepNeedMinutes: 540, recentEfficiencyPercent: 85, regularBedtimeMinutes: 23 * 60, windDownMinutes: 30 });
    expect(result.timeInBedMinutes).toBeGreaterThanOrEqual(540);
    expect(result.bedtimeMinutes).toBe(20 * 60 + 25);
  });

  it("treats wind-down as separate from the bedtime", () => {
    const withoutWindDown = recommendBedtime({ wakeTime: "07:00", sleepNeedMinutes: 510, recentEfficiencyPercent: 100, regularBedtimeMinutes: 22 * 60 + 30, windDownMinutes: 0 });
    const withWindDown = recommendBedtime({ wakeTime: "07:00", sleepNeedMinutes: 510, recentEfficiencyPercent: 100, regularBedtimeMinutes: 22 * 60 + 30, windDownMinutes: 30 });
    expect(withWindDown.bedtimeMinutes).toBe(withoutWindDown.bedtimeMinutes);
    expect(withWindDown.bedtimeMinutes).toBe(22 * 60 + 30);
  });

  it("keeps bedtime regularity coherent across midnight", () => {
    const result = recommendBedtimeFromHistory({
      wakeTime: "07:00",
      sleepNeedMinutes: 450,
      recentNights: [
        { bedtimeMinutes: 23 * 60 + 30, efficiencyPercent: null },
        { bedtimeMinutes: 30, efficiencyPercent: null },
      ],
      windDownMinutes: 30,
    });
    expect(result.recentEfficiencyPercent).toBe(85);
    expect(result.bedtimeMinutes).toBe(22 * 60 + 11);
    expect(result.timeInBedMinutes).toBeGreaterThanOrEqual(result.sleepNeedMinutes);
  });

  it("uses the declared wake time, target and average awake time without efficiency adjustment", () => {
    const result = recommendBedtimeFromAwake({ wakeTime: "07:00", sleepNeedMinutes: 510, averageAwakeMinutes: 36 });
    expect(result).toMatchObject({ bedtimeMinutes: 1_314, timeInBedMinutes: 546, wakeTimeMinutes: 420, sleepNeedMinutes: 510, averageAwakeMinutes: 36 });
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

  it("exposes the 10,000-step target and keeps the documented active-energy fallback", () => {
    expect(EFFORT_STEPS_TARGET).toBe(10_000);
    expect(effortScoreTargets()).toMatchObject({ steps: 10_000, activeEnergyKcal: DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET });
    expect(resolveActiveEnergyKcalTarget(null)).toBe(DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET);
    expect(resolveActiveEnergyKcalTarget(0)).toBe(DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET);
    expect(resolveActiveEnergyKcalTarget(Number.NaN)).toBe(DEFAULT_EFFORT_ACTIVE_ENERGY_KCAL_TARGET);
  });

  it("uses an explicit active-energy target in both score modes", () => {
    const measurements = { zoneMinutes: 75, activeEnergyKcal: 1_000, exerciseMinutes: 60, steps: 10_000 };
    expect(calculateEffortScore(measurements, { activeEnergyKcalTarget: 1_000 }).score).toBe(50);
    expect(calculateEffortScoreFromAvailable(measurements, { activeEnergyKcalTarget: 1_000 })).toMatchObject({ score: 50, coverage: 1 });
    expect(calculateEffortScore(measurements).score).toBeGreaterThan(50);
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
    expect(calculateEffortScoreFromAvailable({ zoneMinutes: 75, activeEnergyKcal: null, exerciseMinutes: null, steps: EFFORT_STEPS_TARGET })).toMatchObject({ score: 50, coverage: 0.5 });
  });

  it("keeps adding accomplished load above each reference with diminishing returns", () => {
    expect(diminishingLoad(EFFORT_STEPS_TARGET, EFFORT_STEPS_TARGET)).toBeCloseTo(.5);
    expect(diminishingLoad(20_000, EFFORT_STEPS_TARGET)).toBeCloseTo(.75);
    expect(diminishingLoad(30_000, EFFORT_STEPS_TARGET)).toBeCloseTo(.875);
    const reference = calculateEffortScore({ zoneMinutes: 75, activeEnergyKcal: 700, exerciseMinutes: 60, steps: EFFORT_STEPS_TARGET });
    const doubled = calculateEffortScore({ zoneMinutes: 150, activeEnergyKcal: 1_400, exerciseMinutes: 120, steps: 20_000 });
    expect(reference).toMatchObject({ score: 50, algorithmVersion: "effort-v3" });
    expect(doubled.score).toBe(75);
  });
});
