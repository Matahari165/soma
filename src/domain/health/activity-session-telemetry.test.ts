import { describe, expect, it } from "vitest";

import { calculateActivitySessionTelemetry } from "./activity-session-telemetry";

const startTime = "2026-09-24T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(startTime) + seconds * 1_000).toISOString();
const personalMaximum = { bpm: 200, source: "personal" as const };

function sample(seconds: number, bpm: number) {
  return {
    measuredAt: at(seconds),
    payload: { heartRate: { beatsPerMinute: String(bpm), sampleTime: { physicalTime: at(seconds) } } },
  };
}

describe("activity session telemetry", () => {
  it("classifies every observed second in five %HRmax zones and keeps outside readings separate", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(8),
      heartRateRecords: [
        sample(0, 99),
        sample(1, 100),
        sample(2, 120),
        sample(3, 140),
        sample(4, 160),
        sample(5, 180),
        sample(6, 200),
        sample(7, 201),
        sample(8, 201),
      ],
      maximumHeartRate: personalMaximum,
    });

    expect(result.maxHeartRateBpm).toBe(201);
    expect(result.coverage).toMatchObject({ sessionSeconds: 8, activeSeconds: 8, observedSeconds: 8, percent: 100, gapCount: 0 });
    expect(result.calculatedZones).toMatchObject({
      method: "percent_max_heart_rate",
      thresholdSource: "soma_max_heart_rate",
      maximumHeartRate: personalMaximum,
      seconds: { z1: 1, z2: 1, z3: 1, z4: 1, z5: 2 },
      belowZoneSeconds: 1,
      aboveMaximumSeconds: 1,
      classifiedSeconds: 8,
      observedSeconds: 8,
      thresholdCoveragePercent: 100,
      complete: true,
    });
  });

  it("excludes reported pauses and leaves long sampling gaps unclassified", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(40),
      heartRateRecords: [sample(0, 100), sample(5, 110), sample(10, 120), sample(30, 140), sample(35, 150), sample(40, 160)],
      maximumHeartRate: personalMaximum,
      exercisePayloads: [{ exercise: { exerciseEvents: [
        { eventTime: at(12), exerciseEventType: "AUTO_PAUSE" },
        { eventTime: at(18), exerciseEventType: "AUTO_RESUME" },
      ] } }],
    });

    expect(result.coverage).toMatchObject({
      sessionSeconds: 40,
      activeSeconds: 34,
      observedSeconds: 20,
      pauseDataAvailable: true,
      pauses: [{ startTime: at(12), endTime: at(18), seconds: 6 }],
      gapCount: 2,
    });
    expect(result.coverage.gaps.map((gap) => gap.seconds)).toEqual([2, 12]);
    expect(result.coverage.percent).toBeCloseTo((20 / 34) * 100);
    expect(result.calculatedZones).toMatchObject({ observedSeconds: 20, classifiedSeconds: 20, complete: true });
  });

  it("does not calculate zones without an HRmax or without an observed interval", () => {
    const noMaximum = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [sample(0, 112), sample(5, 144)],
    });
    const noInterval = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [sample(0, 112)],
      maximumHeartRate: personalMaximum,
    });
    const noSamples = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [],
      maximumHeartRate: personalMaximum,
    });

    expect(noMaximum.maxHeartRateBpm).toBe(144);
    expect(noMaximum.calculatedZones).toBeNull();
    expect(noInterval.calculatedZones).toBeNull();
    expect(noSamples.calculatedZones).toBeNull();
  });

  it("rejects an invalid HRmax at the telemetry boundary", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [sample(0, 112), sample(5, 144)],
      maximumHeartRate: { bpm: 251, source: "personal" },
    });

    expect(result.calculatedZones).toBeNull();
  });

  it("bounds returned samples while retaining the full count and maximum", () => {
    const heartRateRecords = Array.from({ length: 10_002 }, (_, index) => sample(index, index === 9_001 ? 199 : 100));
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(10_001),
      heartRateRecords,
      maximumHeartRate: personalMaximum,
    });

    expect(result.heartRateSampleCount).toBe(10_002);
    expect(result.heartRateSamples).toHaveLength(10_000);
    expect(result.heartRateSamplesDownsampled).toBe(true);
    expect(result.maxHeartRateBpm).toBe(199);
    expect(result.calculatedZones?.complete).toBe(true);
  });
});
