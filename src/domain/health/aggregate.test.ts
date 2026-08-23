import { describe, expect, it } from "vitest";

import { aggregateHealthRecords, type NormalizedHealthRecord } from "./aggregate";

const record = (overrides: Partial<NormalizedHealthRecord>): NormalizedHealthRecord => ({
  data_type: "steps",
  civil_date: "2026-08-07",
  start_time: null,
  end_time: null,
  measured_at: "2026-08-07T12:00:00Z",
  payload: {},
  ...overrides,
});

describe("aggregateHealthRecords", () => {
  it("assigns physical timestamps to the profile civil day across a DST boundary", () => {
    const [day] = aggregateHealthRecords([{ ...record({}), civil_date: null, start_time: null, end_time: null, measured_at: "2026-03-29T22:30:00.000Z" }], "Europe/Paris");
    expect(day.metric_date).toBe("2026-03-30");
  });

  it("aggregates a day without guessing missing metrics", () => {
    const [day] = aggregateHealthRecords([
      record({ payload: { steps: { count: "4200" } } }),
      record({ data_type: "steps", payload: { steps: { count: 800 } } }),
      record({ data_type: "daily-heart-rate-variability", payload: { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds: 52 } } }),
      record({ data_type: "sleep", start_time: "2026-08-06T22:30:00Z", end_time: "2026-08-07T06:30:00Z", payload: { sleep: { summary: { minutesAsleep: 440, minutesInSleepPeriod: 480 } } } }),
    ]);
    expect(day.steps).toBe(5000);
    expect(day.hrv_ms).toBe(52);
    expect(day.sleep_minutes).toBe(440);
    expect(day.sleep_efficiency).toBe(91.7);
    expect(day.resting_heart_rate).toBeNull();
  });

  it("extracts current Google sleep, oxygen and temperature fields", () => {
    const [day] = aggregateHealthRecords([
      record({ data_type: "sleep", start_time: "2026-08-06T22:30:00Z", end_time: "2026-08-07T06:30:00Z", payload: { sleep: { stages: [{ type: "AWAKE" }, { type: "LIGHT" }], summary: { minutesAsleep: 420, minutesInSleepPeriod: 480, minutesAwake: 60, minutesToFallAsleep: 18, stagesSummary: [{ type: "DEEP", minutes: 90, count: 3 }, { type: "REM", minutes: 105, count: 4 }, { type: "LIGHT", minutes: 225, count: 8 }, { type: "AWAKE", minutes: 60, count: 6 }] } } } }),
      record({ data_type: "daily-oxygen-saturation", payload: { dailyOxygenSaturation: { averagePercentage: 96.2, lowerBoundPercentage: 94.7, upperBoundPercentage: 97.4 } } }),
      record({ data_type: "daily-sleep-temperature-derivations", payload: { dailySleepTemperatureDerivations: { nightlyTemperatureCelsius: 33.7, baselineTemperatureCelsius: 33.4 } } }),
    ]);
    expect(day.sleep_latency_minutes).toBe(18);
    expect(day.sleep_fragmentation).toBe(0.1);
    expect(day.sleep_deep_percent).toBe(18.8);
    expect(day.oxygen_saturation).toBe(96.2);
    expect(day.oxygen_saturation_lower).toBe(94.7);
    expect(day.skin_temperature_delta).toBeCloseTo(0.3);
  });

  it("keeps normalized WHOOP records compatible with the same daily metrics", () => {
    const [day] = aggregateHealthRecords([
      record({ provider: "whoop_export", data_type: "sleep", start_time: "2026-05-27T23:36:13+02:00", end_time: "2026-05-28T06:46:45+02:00", payload: { sleep: { metadata: { mainSleep: true }, summary: { minutesAsleep: 415, minutesInSleepPeriod: 430, minutesAwake: 15, stagesSummary: [{ type: "LIGHT", minutes: 200 }, { type: "DEEP", minutes: 149 }, { type: "REM", minutes: 66 }, { type: "AWAKE", minutes: 15 }] } } } }),
      record({ provider: "whoop_export", data_type: "daily-resting-heart-rate", payload: { dailyRestingHeartRate: { beatsPerMinute: 57 } } }),
      record({ provider: "whoop_export", data_type: "daily-heart-rate-variability", payload: { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds: 50 } } }),
      record({ provider: "whoop_export", data_type: "daily-respiratory-rate", payload: { dailyRespiratoryRate: { averageBreathsPerMinute: 17.7 } } }),
      record({ provider: "whoop_export", data_type: "daily-oxygen-saturation", payload: { dailyOxygenSaturation: { averagePercentage: 96.5 } } }),
      record({ provider: "whoop_export", data_type: "daily-sleep-temperature-derivations", payload: { dailySleepTemperatureDerivations: { nightlyTemperatureCelsius: 34.39, baselineTemperatureCelsius: 34.1 } } }),
    ]);

    expect(day.sleep_minutes).toBe(415);
    expect(day.sleep_efficiency).toBe(96.5);
    expect(day.sleep_deep_minutes).toBe(149);
    expect(day.sleep_rem_minutes).toBe(66);
    expect(day.resting_heart_rate).toBe(57);
    expect(day.hrv_ms).toBe(50);
    expect(day.respiratory_rate).toBe(17.7);
    expect(day.oxygen_saturation).toBe(96.5);
    expect(day.skin_temperature_delta).toBeCloseTo(0.29);
  });

  it("sums activity levels and uses measured heart-rate-zone intervals", () => {
    const [day] = aggregateHealthRecords([
      record({ data_type: "active-minutes", payload: { activeMinutes: { activeMinutesByActivityLevel: [{ activityLevel: "LIGHT", activeMinutes: "18" }, { activityLevel: "MODERATE", activeMinutes: "12" }, { activityLevel: "VIGOROUS", activeMinutes: "7" }] } } }),
      record({ data_type: "time-in-heart-rate-zone", start_time: "2026-08-07T10:00:00Z", end_time: "2026-08-07T10:15:00Z", payload: { timeInHeartRateZone: { heartRateZoneType: "MODERATE" } } }),
      record({ data_type: "respiratory-rate-sleep-summary", payload: { respiratoryRateSleepSummary: { deepSleepStats: { breathsPerMinute: 13.2 }, fullSleepStats: { breathsPerMinute: 14.6 } } } }),
    ]);

    expect(day.active_minutes).toBe(37);
    expect(day.moderate_zone_minutes).toBe(15);
    expect(day.respiratory_rate).toBe(14.6);
  });

  it("reads reconciled daily rollups without confusing a true zero with missing data", () => {
    const [day] = aggregateHealthRecords([
      record({ data_type: "steps", payload: { dailyRollup: { steps: { countSum: "0" } } } }),
      record({ data_type: "active-zone-minutes", payload: { dailyRollup: { activeZoneMinutes: { sumInFatBurnHeartZone: "8", sumInCardioHeartZone: "12", sumInPeakHeartZone: "4" } } } }),
      record({ data_type: "time-in-heart-rate-zone", payload: { dailyRollup: { timeInHeartRateZone: { timeInHeartRateZones: [{ heartRateZone: "LIGHT", duration: "600s" }, { heartRateZone: "VIGOROUS", duration: "300s" }] } } } }),
      record({ data_type: "sedentary-period", payload: { dailyRollup: { sedentaryPeriod: { durationSum: "21600s" } } } }),
    ]);

    expect(day.steps).toBe(0);
    expect(day.zone_minutes).toBe(24);
    expect(day.light_zone_minutes).toBe(10);
    expect(day.vigorous_zone_minutes).toBe(5);
    expect(day.sedentary_minutes).toBe(360);
    expect(day.active_energy_kcal).toBeNull();
  });
});
