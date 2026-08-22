import { describe, expect, it } from "vitest";

import { analyzePersonalLab, type LabObservation } from "./insights";

function observation(index: number): LabObservation {
  const date = new Date("2026-01-01T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + index);
  const longSleep = index % 2 === 0;
  return {
    date: date.toISOString().slice(0, 10),
    sleepMinutes: longSleep ? 500 : 430,
    sleepEfficiency: longSleep ? 93 : 87,
    sleepRegularity: longSleep ? 86 : 72,
    sleepDebtMinutes: longSleep ? 0 : 60,
    hrv: longSleep ? 58 : 43,
    restingHeartRate: longSleep ? 55 : 63,
    recoveryScore: longSleep ? 82 : 58,
    effortScore: 60,
    steps: longSleep ? 9_000 : 6_000,
    zoneMinutes: longSleep ? 36 : 12,
    deepWorkMinutes: longSleep ? 260 : 130,
    energy: longSleep ? 5 : 2,
    focus: longSleep ? 5 : 2,
    stress: longSleep ? 2 : 4,
    mood: longSleep ? 5 : 3,
    soreness: 2,
    caffeine: longSleep ? 1 : 3,
    alcohol: 0,
    lateMeal: false,
    illness: false,
  };
}

describe("analyzePersonalLab", () => {
  it("finds an interpretable sleep threshold when both groups are large enough", () => {
    const result = analyzePersonalLab(Array.from({ length: 56 }, (_, index) => observation(index)));
    const discovery = result.discoveries.find((item) => item.id === "sleep-8h-dw");
    expect(discovery).toMatchObject({ effect: 130, sampleSize: 56, stable: true, confidence: "strong" });
    expect(discovery?.title).toContain("2h 10m more deep work");
    expect(result.testedCount).toBeGreaterThan(50);
  });

  it("does not publish a threshold with too few days in one group", () => {
    const days = Array.from({ length: 20 }, (_, index) => ({ ...observation(index), sleepMinutes: index < 3 ? 500 : 430 }));
    const result = analyzePersonalLab(days);
    expect(result.discoveries.some((item) => item.id === "sleep-8h-dw")).toBe(false);
  });

  it("keeps descriptions limited to the observed movement", () => {
    const result = analyzePersonalLab(Array.from({ length: 42 }, (_, index) => observation(index)));
    expect(result.discoveries.every((item) => !/cause|caused|causes/i.test(`${item.title} ${item.description}`))).toBe(true);
  });
});
