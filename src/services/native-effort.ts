import "server-only";

import type { HealthAnalytics, HealthMetricDay } from "@/services/health-analytics";
import { exerciseSummaryFromRecord, getNativeActivityAnalytics } from "@/services/health-analytics";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

const RAW_KEYS = ["steps", "exercise_minutes", "active_energy_kcal", "zone_minutes"] as const;

type RawKey = (typeof RAW_KEYS)[number];

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function latestMeasuredDay(days: HealthMetricDay[]) {
  return days.findLast((day) => RAW_KEYS.some((key) => finite(day[key])));
}

function addDays(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function dateInTimezone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function sourceMeasuredAt(day: HealthMetricDay | undefined) {
  return day?.source_freshness?.latestMeasuredAt ?? null;
}

function coverage(days: HealthMetricDay[], key: RawKey, endDate: string) {
  const window = days.filter((day) => day.metric_date <= endDate).slice(-30);
  return window.filter((day) => finite(day[key])).length / 30;
}

function scoreCoverage(score: HealthAnalytics["scores"][number] | undefined) {
  const value = score?.drivers?.coverage;
  return finite(value) ? Math.min(1, Math.max(0, value)) : null;
}

export function nativeEffortPayload(data: HealthAnalytics) {
  // Keep an in-progress civil day out of the 30-day comparison window.
  const completedDays = data.days.filter((day) => day.metric_date < dateInTimezone(data.timezone));
  const latest = latestMeasuredDay(completedDays);
  const score = latest
    ? data.scores.findLast((item) => item.kind === "effort" && item.score_date === latest.metric_date)
    : undefined;
  const recentDays = latest ? completedDays.filter((day) => day.metric_date <= latest.metric_date).slice(-30) : [];
  const completeRecentWeek = recentDays.slice(-7).length === 7
    && recentDays.slice(-7).every((day) => RAW_KEYS.some((key) => finite(day[key])));

  return {
    timezone: data.timezone,
    period: latest ? { days: 30, startDate: addDays(latest.metric_date, -29), endDate: latest.metric_date } : null,
    latestObservedDate: latest?.metric_date ?? null,
    importedAt: data.importedAt,
    measuredAt: sourceMeasuredAt(latest),
    latest: latest ? {
      date: latest.metric_date,
      steps: latest.steps,
      exerciseMinutes: latest.exercise_minutes,
      activeEnergyKcal: latest.active_energy_kcal,
      zoneMinutes: latest.zone_minutes,
      weeklyLoad: completeRecentWeek ? latest.weekly_load : null,
      acuteChronicLoadRatio: completeRecentWeek ? latest.acute_chronic_load_ratio : null,
      zones: {
        light: latest.light_zone_minutes,
        moderate: latest.moderate_zone_minutes,
        vigorous: latest.vigorous_zone_minutes,
        peak: latest.peak_zone_minutes,
      },
      provenance: "google_health" as const,
    } : null,
    score: score && finite(score.score) ? {
      value: score.score,
      date: score.score_date,
      coverage: scoreCoverage(score),
      algorithmVersion: score.algorithm_version ?? null,
      provenance: "soma_calculation" as const,
    } : null,
    coverage: latest ? {
      expectedDays: 30,
      observedActivityDays: recentDays.filter((day) => RAW_KEYS.some((key) => finite(day[key]))).length,
      byMetric: Object.fromEntries(RAW_KEYS.map((key) => [key, coverage(completedDays, key, latest.metric_date)])),
    } : { expectedDays: 30, observedActivityDays: 0, byMetric: {} },
    trends: latest ? Array.from({ length: 30 }, (_, index) => {
      const date = addDays(latest.metric_date, index - 29);
      const day = recentDays.find((item) => item.metric_date === date);
      return {
        date,
        steps: day?.steps ?? null,
        exerciseMinutes: day?.exercise_minutes ?? null,
        activeEnergyKcal: day?.active_energy_kcal ?? null,
        zoneMinutes: day?.zone_minutes ?? null,
      };
    }) : [],
    exercises: data.exercises.map((exercise) => ({ ...exercise, provenance: "google_health" as const })),
  };
}

async function allImportedExercises(userId: string) {
  const admin = createCloudflareAdminClient();
  const pageSize = 500;
  const records: ReturnType<typeof exerciseSummaryFromRecord>[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from("health_records")
      .select("source_record_id,civil_date,start_time,end_time,payload")
      .eq("user_id", userId).eq("data_type", "exercise")
      .order("civil_date", { ascending: false }).order("end_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error("Exercise history could not be loaded.");
    const page = (data ?? []).map(exerciseSummaryFromRecord);
    records.push(...page);
    if (page.length < pageSize) return records;
  }
}

export async function getNativeEffort(userId: string) {
  const [analytics, exercises] = await Promise.all([getNativeActivityAnalytics(userId), allImportedExercises(userId)]);
  return nativeEffortPayload({ ...analytics, exercises });
}
