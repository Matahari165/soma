import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { calculateSleepScore } from "@/domain/scores/sleep";
import { buildPreviewAnalytics, type HealthAnalytics, type HealthMetricDay } from "@/services/health-analytics";

import { ActivityDetails, effortComponentDefinitions, normalizeEffortContextValue, normalizeEffortTargetValue } from "./activity-details";
import { averageWeeklyZoneMinutes, RecoveryDetails } from "./recovery-details";
import { SleepDetails } from "./sleep-details";
import { SleepStageDistribution, ZoneDistribution } from "./health-charts";
import { HealthHeroScore } from "./health-page-shell";

function day(overrides: Partial<HealthMetricDay> = {}) {
  return {
    metric_date: "2026-09-10",
    sleep_minutes: null,
    sleep_need_minutes: null,
    sleep_efficiency: null,
    sleep_regularity: null,
    sleep_latency_minutes: null,
    sleep_awake_minutes: null,
    sleep_awake_percent: null,
    sleep_awakenings: null,
    sleep_fragmentation: null,
    sleep_deep_minutes: null,
    sleep_deep_percent: null,
    sleep_rem_minutes: null,
    sleep_rem_percent: null,
    sleep_light_minutes: null,
    sleep_light_percent: null,
    daily_sleep_debt_minutes: null,
    cumulative_sleep_debt_minutes: null,
    bedtime: null,
    wake_time: null,
    hrv_ms: null,
    resting_heart_rate: null,
    respiratory_rate: null,
    oxygen_saturation: null,
    oxygen_saturation_lower: null,
    oxygen_saturation_upper: null,
    skin_temperature_delta: null,
    nightly_temperature_celsius: null,
    baseline_temperature_celsius: null,
    steps: null,
    active_energy_kcal: null,
    total_energy_kcal: null,
    zone_minutes: null,
    light_zone_minutes: null,
    moderate_zone_minutes: null,
    vigorous_zone_minutes: null,
    peak_zone_minutes: null,
    active_minutes: null,
    sedentary_minutes: null,
    exercise_minutes: null,
    distance_km: null,
    running_distance_km: null,
    running_duration_minutes: null,
    running_pace_seconds_per_km: null,
    running_average_heart_rate: null,
    floors: null,
    weight_kg: null,
    body_fat_percent: null,
    vo2_max: null,
    altitude_gain_m: null,
    height_cm: null,
    core_body_temperature_celsius: null,
    blood_glucose_mg_dl: null,
    active_day: null,
    active_day_rate_28d: null,
    activity_consistency_28d: null,
    weekly_load: null,
    acute_chronic_load_ratio: null,
    source_freshness: { latestMeasuredAt: null, byType: {} },
    ...overrides,
  } as HealthMetricDay;
}

function analytics(overrides: Partial<HealthAnalytics> = {}) {
  return {
    timezone: "Europe/Zurich",
    importedAt: "2026-09-10T08:00:00.000Z",
    days: [],
    scores: [],
    sleepRecommendation: null,
    latestSleepStages: [],
    heartRateSamples: [],
    exercises: [],
    effortTargets: { zoneMinutes: 75, activeEnergyKcal: 700, exerciseMinutes: 60, steps: 10_000 },
    effortTargetSource: "fallback" as const,
    ...overrides,
  } satisfies HealthAnalytics;
}

describe("health chart data semantics", () => {
  it("keeps null and explicit zero distinct in stage distributions", () => {
    const markup = renderToStaticMarkup(createElement(SleepStageDistribution, {
      stages: [
        { label: "Profond", value: null, tone: "deep" },
        { label: "REM", value: 0, tone: "rem" },
        { label: "Léger", value: 70, tone: "light" },
      ],
    }));

    expect(markup).toContain("Profond<strong>Indisponible</strong>");
    expect(markup).toContain("REM<strong>0.0 %</strong>");
  });

  it("keeps null and explicit zero distinct in heart-rate zones", () => {
    const markup = renderToStaticMarkup(createElement(ZoneDistribution, {
      zones: [
        { label: "Légère", minutes: null, tone: "light" },
        { label: "Modérée", minutes: 0, tone: "moderate" },
        { label: "Vigoureuse", minutes: 12, tone: "vigorous" },
      ],
    }));

    expect(markup).toContain("Légère<strong>Indisponible</strong>");
    expect(markup).toContain("Modérée<strong>0 min</strong>");
    expect(markup).not.toContain("zone-distribution__segment--moderate");
  });
});

describe("health route states", () => {
  it("keeps the effort targets aligned between the radar and its detail", () => {
    const preview = buildPreviewAnalytics();
    const markup = renderToStaticMarkup(createElement(ActivityDetails, {
      data: {
        ...preview,
        effortTargets: { zoneMinutes: 75, activeEnergyKcal: 1_000, exerciseMinutes: 60, steps: 10_000 },
        effortTargetSource: "nutrition_targets",
      },
    }));
    const readable = markup.replaceAll("\u202f", " ");

    expect(readable).toContain("Radar de l’effort avec 5 composantes");
    expect(readable).toContain("Weekly load");
    expect(readable).toContain("Context · excluded from score");
    expect(readable).toContain("Workout history");
    expect(readable).toContain("Running");
    expect(readable).toContain("Pace");
    expect(readable).toContain("Max HR");
    expect(readable).not.toContain("Heart-rate zones");
    expect(readable).toContain("Last synced");
    expect(readable).not.toContain("Provenance");
    expect(readable).not.toContain("Recent activity");
    expect(readable).not.toContain("Active time");

    const components = effortComponentDefinitions({ zoneMinutes: 75, activeEnergyKcal: 1_000, exerciseMinutes: 60, steps: 10_000 }, "nutrition_targets");
    expect(components.find((component) => component.id === "steps")).toMatchObject({ target: 10_000, targetLabel: "10,000 steps" });
    expect(components.find((component) => component.id === "activeEnergyKcal")).toMatchObject({ target: 1_000, targetLabel: "1,000 kcal" });
  });

  it("normalizes weekly load from finite values without inventing missing data", () => {
    expect(normalizeEffortContextValue(20, [10, 20, 30])).toBeCloseTo(0.5);
    expect(normalizeEffortContextValue(null, [10, 20, 30])).toBeNull();
    expect(normalizeEffortContextValue(20, [])).toBeNull();
    expect(normalizeEffortContextValue(20, [20, 20])).toBe(1);
    expect(normalizeEffortTargetValue(10_000, 10_000)).toBe(1);
    expect(normalizeEffortTargetValue(12_000, 10_000)).toBe(1);
    expect(normalizeEffortTargetValue(null, 10_000)).toBeNull();
  });

  it("keeps the score unit visible after its 30-day average", () => {
    const markup = renderToStaticMarkup(createElement(HealthHeroScore, {
      label: "Score",
      value: 84,
      average: 81,
      values: [79, 81, 84],
    }));

    expect(markup).toContain("30-day avg · 81 %");
  });

  it("prioritizes the sleep score radar while keeping secondary trends accessible", () => {
    const first = day({ metric_date: "2026-09-09", sleep_minutes: 450, sleep_need_minutes: 480, sleep_efficiency: 90, sleep_latency_minutes: 20, cumulative_sleep_debt_minutes: 20, sleep_fragmentation: 1.2, sleep_deep_minutes: 80, sleep_rem_minutes: 90, bedtime: "2026-09-08T22:30:00Z", wake_time: "2026-09-09T06:30:00Z" });
    const latest = day({ metric_date: "2026-09-10", sleep_minutes: 480, sleep_need_minutes: 480, sleep_efficiency: 92, sleep_latency_minutes: 10, cumulative_sleep_debt_minutes: 0, sleep_fragmentation: 0.9, sleep_deep_minutes: 90, sleep_deep_percent: 18, sleep_rem_minutes: 100, sleep_rem_percent: 20, sleep_light_percent: 55, sleep_awake_percent: 7, bedtime: "2026-09-09T22:30:00Z", wake_time: "2026-09-10T06:30:00Z" });
    const markup = renderToStaticMarkup(createElement(SleepDetails, {
      data: analytics({
        days: [first, latest],
        scores: [{ score_date: "2026-09-10", kind: "sleep", score: 82, drivers: {} }],
        sleepRecommendation: { bedtimeMinutes: 1_350, timeInBedMinutes: 510, sleepNeedMinutes: 490, wakeTimeMinutes: 420, windDownMinutes: 30, recentEfficiencyPercent: 92, algorithmVersion: "test" },
      }),
    }));

    expect(markup).not.toContain("Profil du sommeil");
    expect(markup).toContain("Sleep radar");
    expect(markup).toContain("Duration");
    expect(markup).not.toContain("Latency");
    expect(markup).toContain("Sleep score");
    expect(markup).toContain("/100");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toMatch(/<g[^>]*aria-pressed=/);
    expect(markup).toContain("Stage distribution");
    expect(markup).not.toContain("Autres mesures");
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
    expect(markup).not.toContain("Next night");
    expect(markup.match(/<article class="metric-trend-card/g)?.length).toBe(5);
    expect(markup).not.toContain('<article class="metric-trend-card"><span>Sommeil total');
    expect(markup).not.toContain('<article class="metric-trend-card"><span>Dette de sommeil');
    expect(markup).toContain("Deep + REM sleep");
    expect(markup).toContain("0 h 0 min");
    expect(markup).not.toContain("health-hero-score-card");
    expect(markup).not.toContain("Objectif en périphérie");
    expect(markup).not.toContain("Continuité");
    expect(markup).not.toContain("Architecture");
    expect(markup).not.toContain("Phases importées");
  });

  it("keeps a concise missing recommendation state for a partial sleep day", () => {
    const markup = renderToStaticMarkup(createElement(SleepDetails, {
      data: analytics({
        days: [day({ sleep_efficiency: 90, bedtime: "2026-09-09T22:30:00Z", wake_time: "2026-09-10T07:00:00Z" })],
      }),
    }));

    expect(markup).not.toContain("Benchmark unavailable");
    expect(markup).toContain("Duration, Regularity, Debt");
    expect(markup).toContain("90");
    expect(markup).not.toContain("health-hero-score-card");
  });

  it("renders a dedicated empty state without trend cards", () => {
    const markup = renderToStaticMarkup(createElement(SleepDetails, { data: analytics() }));

    expect(markup).toContain("No sleep data");
    expect(markup).not.toContain("metric-trend-card");
  });

  it("includes sleep in recovery fallback coverage without a redundant radar note", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ sleep_minutes: 480, hrv_ms: null, resting_heart_rate: null })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: 60, drivers: {} }],
      }),
    }));

    expect(markup).not.toContain("Calcul Soma · VFC");
    expect(markup).toMatch(/33\s*%/);
  });

  it("keeps the recovery rail limited to score and resting heart rate", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ hrv_ms: 54, resting_heart_rate: 57, respiratory_rate: 14.2, sleep_minutes: 480 })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: 82, drivers: { hrv: 80, restingHeartRate: 84, sleep: 82, coverage: 1 } }],
      }),
    }));

    expect(markup).toContain("Recovery score");
    expect(markup).toContain("Resting heart rate");
    expect(markup).not.toContain("Durée de sommeil");
    expect(markup).not.toContain("Charge du jour");
    expect(markup).not.toContain("Énergie métabolique");
    expect(markup).toContain("Nightly HRV");
    expect(markup).toContain("Respiratory rate");
    expect(markup).not.toContain("Heart rate variability");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('id="recovery-radar-detail"');
    expect(markup).toContain('data-open="false"');
  });

  it("keeps partial recovery averages without a sample-count suffix", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ hrv_ms: 54, resting_heart_rate: null, respiratory_rate: null, sleep_minutes: 480 })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: 72, drivers: { hrv: 70, sleep: 76, coverage: 0.67 } }],
      }),
    }));

    expect(markup).toContain("30-day avg · 54 ms");
    expect(markup).toContain("30-day avg · —");
    expect(markup).not.toContain("n=1");
    expect(markup).not.toContain("n=0");
  });

  it("does not render a sample-based heart-rate trend on recovery", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ hrv_ms: 54, resting_heart_rate: 57, sleep_minutes: 480 })],
        heartRateSamples: [{ measuredAt: "2026-09-10T08:00:00.000Z", bpm: 60 }],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: 82, drivers: { hrv: 80, restingHeartRate: 84, sleep: 82, coverage: 1 } }],
      }),
    }));

    expect(markup).not.toContain(">Fréquence cardiaque</span>");
  });

  it("uses the shared bar-chart treatment once per distinct recovery signal", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, { data: buildPreviewAnalytics() }));

    expect(markup).toContain(">Graphiques</h2>");
    expect(markup.match(/health-bar-chart/g)?.length).toBe(3);
    expect(markup.match(/health-chart-average-label/g)?.length).toBe(3);
    expect(markup).not.toContain("Heart rate variability");
    expect(markup).not.toContain("metric-trend-card__average");
  });

  it("provides visible weighted recovery drivers in the local analytics preview", () => {
    const latestRecovery = buildPreviewAnalytics().scores.findLast((score) => score.kind === "recovery");

    expect(latestRecovery?.drivers).toMatchObject({ hrv: expect.any(Number), restingHeartRate: expect.any(Number), sleep: expect.any(Number), coverage: 1 });
  });

  it("derives the preview sleep score and drivers from the real engine inputs", () => {
    const preview = buildPreviewAnalytics();
    const latest = preview.days.at(-1);
    const latestSleep = preview.scores.findLast((score) => score.kind === "sleep");

    expect(latest).toBeDefined();
    expect(latestSleep).toBeDefined();
    const expected = calculateSleepScore({
      actualSleepMinutes: latest?.sleep_minutes ?? 0,
      estimatedNeedMinutes: latest?.sleep_need_minutes ?? 0,
      efficiencyPercent: latest?.sleep_efficiency ?? 0,
      regularityPercent: latest?.sleep_regularity ?? 0,
    });

    expect(latestSleep).toMatchObject({
      score: expected.score,
      algorithm_version: expected.algorithmVersion,
      drivers: {
        duration: expected.durationComponent,
        efficiency: expected.efficiencyComponent,
        regularity: expected.regularityComponent,
      },
    });
    expect(latestSleep?.score).not.toBe(86);
  });

  it("does not mix sleep score algorithm versions in the 30-day average", () => {
    const markup = renderToStaticMarkup(createElement(SleepDetails, {
      data: analytics({
        days: [day({
          sleep_minutes: 480,
          sleep_need_minutes: 480,
          sleep_efficiency: 92,
          sleep_regularity: 84,
          sleep_latency_minutes: 10,
          cumulative_sleep_debt_minutes: 0,
        })],
        scores: [
          { score_date: "2026-09-07", kind: "sleep", score: 20, drivers: {}, algorithm_version: "sleep-v0.1" },
          { score_date: "2026-09-08", kind: "sleep", score: 80, drivers: {}, algorithm_version: "sleep-v0.2" },
          { score_date: "2026-09-09", kind: "sleep", score: 100, drivers: {}, algorithm_version: "sleep-v0.1" },
          { score_date: "2026-09-10", kind: "sleep", score: 90, drivers: {}, algorithm_version: "sleep-v0.2" },
        ],
      }),
    }));

    expect(markup).toContain('30-day avg · <strong>85</strong><span> /100</span>');
    expect(markup).not.toContain('30-day avg · <strong>73</strong><span> /100</span>');
  });

  it("keeps a recovery day when sleep and heart-rate values are absent", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ respiratory_rate: 14.2, hrv_ms: null, resting_heart_rate: null, sleep_minutes: null })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: null, drivers: {} }],
      }),
    }));

    expect(markup).toContain("Respiratory rate");
    expect(markup).toContain("14.2");
  });

  it("averages weekly heart-rate zones by measured day and keeps missing zones absent", () => {
    const summary = averageWeeklyZoneMinutes([
      day({ metric_date: "2026-09-08", light_zone_minutes: 20, moderate_zone_minutes: null, vigorous_zone_minutes: 0, peak_zone_minutes: null }),
      day({ metric_date: "2026-09-10", light_zone_minutes: 40, moderate_zone_minutes: 10, vigorous_zone_minutes: null, peak_zone_minutes: null }),
    ], "2026-09-10");

    expect(summary.startDate).toBe("2026-09-07");
    expect(summary.endDate).toBe("2026-09-13");
    expect(summary.zones.find((zone) => zone.label === "Light")).toMatchObject({ minutes: 30, measuredDays: 2 });
    expect(summary.zones.find((zone) => zone.label === "Vigorous")).toMatchObject({ minutes: 0, measuredDays: 1 });
    expect(summary.zones.find((zone) => zone.label === "Peak")).toMatchObject({ minutes: null, measuredDays: 0 });
  });

  it("keeps recovery empty without orphaned trend cards", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, { data: analytics() }));

    expect(markup).toContain("No recovery data");
    expect(markup).not.toContain("Trends");
  });

  it("does not infer full effort coverage from a non-null score", () => {
    const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const previousDate = new Date(`${currentDate}T12:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const markup = renderToStaticMarkup(createElement(ActivityDetails, {
      data: analytics({
        days: [day({ metric_date: previousDate.toISOString().slice(0, 10), steps: 1_000 })],
        scores: [{ score_date: previousDate.toISOString().slice(0, 10), kind: "effort", score: 50, drivers: {} }],
        exercises: [{ id: "strength", date: previousDate.toISOString().slice(0, 10), name: "Renfo", type: "WEIGHT_TRAINING", durationMinutes: 40, activeMinutes: 30, calories: 200, distanceKm: null, averageHeartRate: 120, zoneMinutes: 15, averageSpeedKph: null, averagePaceSecondsPerKm: null, elevationGainMeters: null, steps: 1_000, runVo2Max: null, swimLengths: null, cadence: null, strideLengthMeters: null, groundContactMilliseconds: null, verticalOscillationMillimeters: null, verticalRatio: null }],
      }),
    }));

    expect(markup).toMatch(/25\s*%\s*score coverage/i);
    expect(markup).toContain("Strength");
  });
});
