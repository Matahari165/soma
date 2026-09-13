import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildPreviewAnalytics, type HealthAnalytics, type HealthMetricDay } from "@/services/health-analytics";

import { ActivityDetails } from "./activity-details";
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
  it("keeps the score unit visible after its 30-day average", () => {
    const markup = renderToStaticMarkup(createElement(HealthHeroScore, {
      label: "Score",
      value: 84,
      average: 81,
      values: [79, 81, 84],
    }));

    expect(markup).toContain("Moy. 30 j · 81 %");
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

    expect(markup).toContain("Profil du sommeil");
    expect(markup).toContain("Durée");
    expect(markup).toContain("Latence");
    expect(markup).toContain("Score Sommeil");
    expect(markup).toContain("/100");
    expect(markup).toContain("Répartition des phases");
    expect(markup).toContain("Autres mesures");
    expect(markup.match(/<article class="metric-trend-card/g)?.length).toBe(6);
    expect(markup).not.toContain('<article class="metric-trend-card"><span>Sommeil total');
    expect(markup).not.toContain('<article class="metric-trend-card"><span>Dette de sommeil');
    expect(markup).toContain("Sommeil profond + paradoxal");
    expect(markup).toContain("0h 0m");
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

    expect(markup).toContain("Repère indisponible");
    expect(markup).toContain("Indisponible : Durée, Régularité, Latence, Dette.");
    expect(markup).toContain("90");
    expect(markup).not.toContain("health-hero-score-card");
  });

  it("renders a dedicated empty state without trend cards", () => {
    const markup = renderToStaticMarkup(createElement(SleepDetails, { data: analytics() }));

    expect(markup).toContain("Aucune donnée de sommeil");
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
    expect(markup).toContain("33 %");
  });

  it("keeps the recovery rail limited to score and resting heart rate", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ hrv_ms: 54, resting_heart_rate: 57, respiratory_rate: 14.2, sleep_minutes: 480 })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: 82, drivers: { hrv: 80, restingHeartRate: 84, sleep: 82, coverage: 1 } }],
      }),
    }));

    expect(markup).toContain("Score de récupération");
    expect(markup).toContain("FC au repos");
    expect(markup).not.toContain("Durée de sommeil");
    expect(markup).not.toContain("Charge du jour");
    expect(markup).not.toContain("Énergie métabolique");
    expect(markup).toContain("Variabilité cardiaque");
    expect(markup).toContain("VFC nocturne");
    expect(markup).toContain("Fréquence respiratoire");
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

  it("provides visible weighted recovery drivers in the local analytics preview", () => {
    const latestRecovery = buildPreviewAnalytics().scores.findLast((score) => score.kind === "recovery");

    expect(latestRecovery?.drivers).toMatchObject({ hrv: expect.any(Number), restingHeartRate: expect.any(Number), sleep: expect.any(Number), coverage: 1 });
  });

  it("keeps a recovery day when sleep and heart-rate values are absent", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, {
      data: analytics({
        days: [day({ respiratory_rate: 14.2, hrv_ms: null, resting_heart_rate: null, sleep_minutes: null })],
        scores: [{ score_date: "2026-09-10", kind: "recovery", score: null, drivers: {} }],
      }),
    }));

    expect(markup).toContain("Fréquence respiratoire");
    expect(markup).toContain("14.2");
  });

  it("averages weekly heart-rate zones by measured day and keeps missing zones absent", () => {
    const summary = averageWeeklyZoneMinutes([
      day({ metric_date: "2026-09-08", light_zone_minutes: 20, moderate_zone_minutes: null, vigorous_zone_minutes: 0, peak_zone_minutes: null }),
      day({ metric_date: "2026-09-10", light_zone_minutes: 40, moderate_zone_minutes: 10, vigorous_zone_minutes: null, peak_zone_minutes: null }),
    ], "2026-09-10");

    expect(summary.startDate).toBe("2026-09-07");
    expect(summary.endDate).toBe("2026-09-13");
    expect(summary.zones.find((zone) => zone.label === "Légère")).toMatchObject({ minutes: 30, measuredDays: 2 });
    expect(summary.zones.find((zone) => zone.label === "Vigoureuse")).toMatchObject({ minutes: 0, measuredDays: 1 });
    expect(summary.zones.find((zone) => zone.label === "Pic")).toMatchObject({ minutes: null, measuredDays: 0 });
  });

  it("keeps recovery empty without orphaned trend cards", () => {
    const markup = renderToStaticMarkup(createElement(RecoveryDetails, { data: analytics() }));

    expect(markup).toContain("Aucune donnée de récupération");
    expect(markup).not.toContain("Tendances de récupération");
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

    expect(markup).toMatch(/25\s*% de couverture du score/);
    expect(markup).toContain("Renforcement musculaire");
  });
});
