import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/services/health-analytics", () => ({ getNativeActivityAnalytics: vi.fn() }));

import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";
import { nativeEffortPayload } from "./native-effort";

function day(overrides: Partial<HealthMetricDay>): HealthMetricDay {
  return {
    metric_date: "2026-09-18",
    source_freshness: { latestMeasuredAt: "2026-09-18T20:00:00Z" },
    ...Object.fromEntries([
      "sleep_minutes", "sleep_need_minutes", "sleep_efficiency", "sleep_regularity", "sleep_latency_minutes", "sleep_awake_minutes", "sleep_awake_percent", "sleep_awakenings", "sleep_fragmentation", "sleep_deep_minutes", "sleep_deep_percent", "sleep_rem_minutes", "sleep_rem_percent", "sleep_light_minutes", "sleep_light_percent", "daily_sleep_debt_minutes", "cumulative_sleep_debt_minutes", "bedtime", "wake_time", "hrv_ms", "resting_heart_rate", "respiratory_rate", "oxygen_saturation", "oxygen_saturation_lower", "oxygen_saturation_upper", "skin_temperature_delta", "nightly_temperature_celsius", "baseline_temperature_celsius", "steps", "active_energy_kcal", "total_energy_kcal", "zone_minutes", "light_zone_minutes", "moderate_zone_minutes", "vigorous_zone_minutes", "peak_zone_minutes", "active_minutes", "sedentary_minutes", "exercise_minutes", "distance_km", "running_distance_km", "running_duration_minutes", "running_pace_seconds_per_km", "running_average_heart_rate", "floors", "weight_kg", "body_fat_percent", "vo2_max", "altitude_gain_m", "height_cm", "core_body_temperature_celsius", "blood_glucose_mg_dl", "active_day", "active_day_rate_28d", "activity_consistency_28d", "weekly_load", "acute_chronic_load_ratio",
    ].map((key) => [key, null])),
    ...overrides,
  } as HealthMetricDay;
}

function analytics(days: HealthMetricDay[]): HealthAnalytics {
  return { timezone: "Pacific/Kiritimati", importedAt: null, days, scores: [], sleepRecommendation: null, latestSleepStages: [], heartRateSamples: [], exercises: [], effortTargets: { zoneMinutes: 75, exerciseMinutes: 45, activeEnergyKcal: 700, steps: 10_000 }, effortTargetSource: "fallback" };
}

describe("native Effort payload", () => {
  it("keeps absent activity unavailable instead of zero", () => {
    const payload = nativeEffortPayload(analytics([day({})]));
    expect(payload.latest).toBeNull();
    expect(payload.score).toBeNull();
    expect(payload.coverage.observedActivityDays).toBe(0);
  });

  it("keeps an explicitly measured zero", () => {
    const payload = nativeEffortPayload(analytics([day({ steps: 0, active_energy_kcal: 0 })]));
    expect(payload.latest?.steps).toBe(0);
    expect(payload.latest?.activeEnergyKcal).toBe(0);
  });

  it("withholds calculated load when the recent week is incomplete", () => {
    const payload = nativeEffortPayload(analytics([day({ steps: 2_000, weekly_load: 400, acute_chronic_load_ratio: 1.1 })]));
    expect(payload.latest?.weeklyLoad).toBeNull();
    expect(payload.latest?.acuteChronicLoadRatio).toBeNull();
  });

  it("measures sparse coverage against the full 30-day period", () => {
    const payload = nativeEffortPayload(analytics([day({ steps: 2_000 })]));
    expect(payload.coverage.byMetric.steps).toBeCloseTo(1 / 30);
  });

  it("keeps only exercises inside the displayed period", () => {
    const data = analytics([day({ steps: 2_000 })]);
    data.exercises = [
      { id: "recent", date: "2026-09-18", name: "Récent", type: "RUNNING", durationMinutes: 30, activeMinutes: 28, calories: 300, distanceKm: 5, averageHeartRate: 145, zoneMinutes: 20, averageSpeedKph: 10, averagePaceSecondsPerKm: 360, elevationGainMeters: 20, steps: null, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null },
      { id: "old", date: "2026-08-01", name: "Ancien", type: "RUNNING", durationMinutes: 30, activeMinutes: 28, calories: 300, distanceKm: 5, averageHeartRate: 145, zoneMinutes: 20, averageSpeedKph: 10, averagePaceSecondsPerKm: 360, elevationGainMeters: 20, steps: null, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null },
    ];

    expect(nativeEffortPayload(data).exercises.map((exercise) => exercise.id)).toEqual(["recent"]);
  });
});
