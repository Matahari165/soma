import "server-only";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { exerciseSummaryFromRecord, type ExerciseSummary } from "@/services/health-analytics";

const RUN_TYPES = new Set(["RUNNING", "JOGGING", "TRAIL_RUNNING"]);
const PAGE_SIZE = 500;

type DailyRun = {
  metric_date: string;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  running_pace_seconds_per_km: number | null;
  running_average_heart_rate: number | null;
};

type LatestRunSources = {
  activities(userId: string, throughDate: string): Promise<ExerciseSummary[]>;
  dailyRuns(userId: string): Promise<DailyRun[]>;
  profile(userId: string): Promise<{ timezone: string; lastSyncedAt: string | null }>;
};

function validNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isRunningDay(day: DailyRun) {
  return validNumber(day.running_distance_km) || validNumber(day.running_duration_minutes)
    || validNumber(day.running_pace_seconds_per_km) || validNumber(day.running_average_heart_rate);
}

function localDate(now: Date, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  }
}

const defaultSources: LatestRunSources = {
  async activities(userId, throughDate) {
    const admin = createCloudflareAdminClient();
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await admin.from("health_records")
        .select("source_record_id,civil_date,start_time,end_time,payload")
        .eq("user_id", userId).eq("data_type", "exercise")
        .order("civil_date", { ascending: false }).order("end_time", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw new Error("Latest imported activity could not be loaded.");
      const page = (result.data ?? []) as Parameters<typeof exerciseSummaryFromRecord>[0][];
      const runs = page.map(exerciseSummaryFromRecord)
        .filter((activity) => RUN_TYPES.has(activity.type.toUpperCase()) && activity.date <= throughDate);
      if (runs.length || page.length < PAGE_SIZE) return runs;
    }
  },
  async dailyRuns(userId) {
    const admin = createCloudflareAdminClient();
    const rows: DailyRun[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await admin.from("daily_health_metrics")
        .select("metric_date,running_distance_km,running_duration_minutes,running_pace_seconds_per_km,running_average_heart_rate")
        .eq("user_id", userId).order("metric_date", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw new Error("Latest running metrics could not be loaded.");
      const page = (result.data ?? []) as DailyRun[];
      rows.push(...page);
      if (page.some(isRunningDay) || page.length < PAGE_SIZE) return rows;
    }
  },
  async profile(userId) {
    const admin = createCloudflareAdminClient();
    const [profile, connection] = await Promise.all([
      admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      admin.from("provider_connections").select("last_synced_at").eq("user_id", userId).eq("provider", "google_health").maybeSingle(),
    ]);
    if (profile.error || connection.error) throw new Error("Running data freshness could not be loaded.");
    return { timezone: profile.data?.timezone ?? "Europe/Paris", lastSyncedAt: connection.data?.last_synced_at ?? null };
  },
};

export async function loadLatestRun(userId: string, options: { sources?: LatestRunSources; now?: Date } = {}) {
  const sources = options.sources ?? defaultSources;
  const profile = await sources.profile(userId);
  const today = localDate(options.now ?? new Date(), profile.timezone);
  const [activities, dailyRows] = await Promise.all([sources.activities(userId, today), sources.dailyRuns(userId)]);
  const latestActivity = activities
    .filter((activity) => RUN_TYPES.has(activity.type.toUpperCase()) && activity.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0] ?? null;
  const latestDaily = dailyRows.filter((day) => day.metric_date <= today && isRunningDay(day))
    .sort((a, b) => b.metric_date.localeCompare(a.metric_date))[0] ?? null;
  const latestRecordedDate = [latestActivity?.date, latestDaily?.metric_date].filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
  const syncDate = profile.lastSyncedAt ? localDate(new Date(profile.lastSyncedAt), profile.timezone) : null;
  return {
    today,
    timezone: profile.timezone,
    latestRecordedDate,
    latestImportedActivity: latestActivity,
    latestDailyMetrics: latestDaily,
    lastSyncedAt: profile.lastSyncedAt,
    syncCoversToday: syncDate !== null && syncDate >= today,
    note: "Les deux sources peuvent avoir des couvertures différentes. Une ancienne date enregistrée ne prouve pas qu'aucune course plus récente n'a eu lieu. Si la synchronisation ou la séance attendue manque, signale cette limite sans présenter une ancienne course comme la dernière réellement effectuée.",
  };
}
