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
      record({ provider: "whoop_export", data_type: "exercise", start_time: "2026-08-07T10:00:00Z", end_time: "2026-08-07T11:00:00Z", payload: { exercise: { exerciseType: "RUNNING" } } }),
      record({ provider: "whoop_export", data_type: "daily-exercise-summary", payload: { dailyExerciseSummary: { minutes: 60 } } }),
      record({ provider: "whoop_export", data_type: "time-in-heart-rate-zone", payload: { timeInHeartRateZone: { timeInHeartRateZones: [{ heartRateZone: "VIGOROUS", durationMinutes: 28 }, { heartRateZone: "PEAK", durationMinutes: 5 }] } } }),
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
    expect(day.exercise_minutes).toBe(60);
    expect(day.vigorous_zone_minutes).toBe(28);
    expect(day.peak_zone_minutes).toBe(5);
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

  it("aggregates the metrics of one running exercise", () => {
    const [day] = aggregateHealthRecords([
      record({
        data_type: "exercise",
        start_time: "2026-08-07T10:00:00Z",
        end_time: "2026-08-07T10:25:00Z",
        payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 5_000_000, averageHeartRateBeatsPerMinute: 150 } } },
      }),
    ]);

    expect(day.running_distance_km).toBe(5);
    expect(day.running_duration_minutes).toBe(25);
    expect(day.running_pace_seconds_per_km).toBe(300);
    expect(day.running_average_heart_rate).toBe(150);
  });

  it("aggregates several runs using total pace and duration-weighted heart rate", () => {
    const [day] = aggregateHealthRecords([
      record({
        data_type: "exercise",
        start_time: "2026-08-07T10:00:00Z",
        end_time: "2026-08-07T10:25:00Z",
        payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 5_000_000, averageHeartRateBeatsPerMinute: 150 } } },
      }),
      record({
        data_type: "exercise",
        start_time: "2026-08-07T18:00:00Z",
        end_time: "2026-08-07T18:18:00Z",
        payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 3_000_000, averageHeartRateBeatsPerMinute: 160 } } },
      }),
    ]);

    expect(day.running_distance_km).toBe(8);
    expect(day.running_duration_minutes).toBe(43);
    expect(day.running_pace_seconds_per_km).toBe(322.5);
    expect(day.running_average_heart_rate).toBeCloseTo((150 * 25 + 160 * 18) / 43);
  });

  it("keeps running metrics missing on a day without a run", () => {
    const [day] = aggregateHealthRecords([record({ data_type: "steps", payload: { steps: { count: 4200 } } })]);

    expect(day.running_distance_km).toBeNull();
    expect(day.running_duration_minutes).toBeNull();
    expect(day.running_pace_seconds_per_km).toBeNull();
    expect(day.running_average_heart_rate).toBeNull();
  });

  it("preserves partial running metrics without filling missing values with zero", () => {
    const [distanceOnly, durationOnly] = aggregateHealthRecords([
      record({ data_type: "exercise", civil_date: "2026-08-07", payload: { exercise: { exerciseType: "RUNNING", metricsSummary: { distanceMillimeters: 4_000_000, averageHeartRateBeatsPerMinute: 145 } } } }),
      record({ data_type: "exercise", civil_date: "2026-08-08", start_time: "2026-08-08T10:00:00Z", end_time: "2026-08-08T10:20:00Z", payload: { exercise: { exerciseType: "RUNNING", metricsSummary: {} } } }),
    ]);

    expect(distanceOnly.running_distance_km).toBe(4);
    expect(distanceOnly.running_duration_minutes).toBeNull();
    expect(distanceOnly.running_pace_seconds_per_km).toBeNull();
    expect(distanceOnly.running_average_heart_rate).toBe(145);
    expect(durationOnly.running_distance_km).toBeNull();
    expect(durationOnly.running_duration_minutes).toBe(20);
    expect(durationOnly.running_pace_seconds_per_km).toBeNull();
    expect(durationOnly.running_average_heart_rate).toBeNull();
  });
});
