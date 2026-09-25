import { describe, expect, it } from "vitest";

import { calculateActivitySessionTelemetry } from "./activity-session-telemetry";

const startTime = "2026-09-24T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(startTime) + seconds * 1_000).toISOString();

function sample(seconds: number, bpm: number, civilDate = "2026-09-24") {
  return {
    measuredAt: at(seconds),
    civilDate,
    payload: { heartRate: { beatsPerMinute: String(bpm), sampleTime: { physicalTime: at(seconds) } } },
  };
}

const dailyZones = {
  civilDate: "2026-09-24",
  payload: {
    dailyHeartRateZones: {
      heartRateZones: [
        { heartRateZoneType: "LIGHT", minBeatsPerMinute: "90", maxBeatsPerMinute: "110" },
        { heartRateZoneType: "MODERATE", minBeatsPerMinute: "111", maxBeatsPerMinute: "130" },
        { heartRateZoneType: "VIGOROUS", minBeatsPerMinute: "131", maxBeatsPerMinute: "150" },
        { heartRateZoneType: "PEAK", minBeatsPerMinute: "151", maxBeatsPerMinute: "220" },
      ],
    },
  },
};

describe("activity session telemetry", () => {
  it("calculates max HR, sample intervals, and time in Google threshold zones", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(10),
      date: "2026-09-24",
      heartRateRecords: [sample(0, 100), sample(2, 105), sample(4, 120), sample(6, 140), sample(8, 160), sample(10, 170)],
      dailyZoneRecords: [dailyZones],
    });

    expect(result.maxHeartRateBpm).toBe(170);
    expect(result.heartRateSampleCount).toBe(6);
    expect(result.heartRateSamples).toHaveLength(6);
    expect(result.heartRateSamplesDownsampled).toBe(false);
    expect(result.coverage).toMatchObject({ sessionSeconds: 10, activeSeconds: 10, observedSeconds: 10, percent: 100, gapCount: 0 });
    expect(result.calculatedZones).toMatchObject({
      source: "calculated_from_heart_rate_samples",
      thresholdSource: "google_daily_heart_rate_zones",
      seconds: { light: 4, moderate: 2, vigorous: 2, peak: 2 },
      classifiedSeconds: 10,
      complete: true,
    });
  });

  it("excludes reported pauses and leaves long sampling gaps uncovered", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(40),
      heartRateRecords: [sample(0, 100), sample(5, 110), sample(10, 120), sample(30, 140), sample(35, 150), sample(40, 160)],
      dailyZoneRecords: [dailyZones],
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
    expect(result.calculatedZones?.observedSeconds).toBe(20);
  });

  it("does not invent zone thresholds when Google has not supplied them", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [sample(0, 112), sample(5, 144)],
      dailyZoneRecords: [],
    });

    expect(result.maxHeartRateBpm).toBe(144);
    expect(result.calculatedZones).toBeNull();
  });

  it("rejects ambiguous or incomplete Google zone thresholds", () => {
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(5),
      heartRateRecords: [sample(0, 112), sample(5, 144)],
      dailyZoneRecords: [{
        civilDate: "2026-09-24",
        payload: { dailyHeartRateZones: { heartRateZones: [
          { heartRateZoneType: "LIGHT", minBeatsPerMinute: "80", maxBeatsPerMinute: "110" },
          { heartRateZoneType: "MODERATE", minBeatsPerMinute: "110", maxBeatsPerMinute: "130" },
          { heartRateZoneType: "VIGOROUS", minBeatsPerMinute: "131", maxBeatsPerMinute: "150" },
        ] } },
      }],
    });

    expect(result.calculatedZones).toBeNull();
  });

  it("bounds returned samples while retaining the full count and maximum", () => {
    const heartRateRecords = Array.from({ length: 10_002 }, (_, index) => sample(index, index === 9_001 ? 199 : 100));
    const result = calculateActivitySessionTelemetry({
      startTime: at(0),
      endTime: at(10_001),
      heartRateRecords,
      dailyZoneRecords: [],
    });

    expect(result.heartRateSampleCount).toBe(10_002);
    expect(result.heartRateSamples).toHaveLength(10_000);
    expect(result.heartRateSamplesDownsampled).toBe(true);
    expect(result.maxHeartRateBpm).toBe(199);
  });
});
