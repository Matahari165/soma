import { calculateSignalFreshness } from "@/domain/health/freshness";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import type { HealthMetricDay, ScoreDay } from "@/services/health-analytics";

const METRIC_COLUMNS = "metric_date,sleep_minutes,hrv_ms,resting_heart_rate,source_freshness";
const RECOVERY_DAYS = 30;

type RecoveryMetric = Pick<HealthMetricDay, "metric_date" | "sleep_minutes" | "hrv_ms" | "resting_heart_rate" | "source_freshness">;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function measuredAverage(days: RecoveryMetric[], key: "hrv_ms" | "resting_heart_rate") {
  const values = days.map((day) => day[key]).filter(finite);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    measuredDays: values.length,
  };
}

function recoveryReason(input: {
  latest: RecoveryMetric | undefined;
  score: number | null;
  drivers: Record<string, unknown>;
  hrvHistory: number;
  restingHeartRateHistory: number;
}) {
  if (input.score !== null) return null;
  if (!input.latest) return "Aucune mesure de récupération n’a encore été importée.";
  if (!finite(input.latest.hrv_ms)) return "La mesure HRV est absente pour cette date.";
  if (!finite(input.latest.resting_heart_rate)) return "La fréquence cardiaque au repos est absente pour cette date.";
  if (input.hrvHistory < 8) return "Il faut au moins 7 mesures historiques de VFC pour établir votre référence personnelle.";
  if (input.restingHeartRateHistory < 8) return "Il faut au moins 7 mesures historiques de fréquence cardiaque au repos pour établir votre référence personnelle.";
  if (!finite(input.drivers.sleep)) return "Le score de sommeil nécessaire au calcul est indisponible.";
  return "Le calcul n’est pas disponible pour cette date. Les mesures présentes restent affichées séparément.";
}

export function buildNativeRecoveryResponse(input: {
  timezone: string;
  importedAt: string | null;
  days: RecoveryMetric[];
  scores: ScoreDay[];
}) {
  const days = [...input.days].sort((left, right) => left.metric_date.localeCompare(right.metric_date)).slice(-RECOVERY_DAYS);
  const latest = days.findLast((day) => finite(day.hrv_ms) || finite(day.resting_heart_rate) || finite(day.sleep_minutes));
  const scoreDay = latest
    ? input.scores.findLast((item) => item.kind === "recovery" && item.score_date === latest.metric_date)
    : undefined;
  const drivers = scoreDay?.drivers ?? {};
  const hrvReference = measuredAverage(days, "hrv_ms");
  const restingHeartRateReference = measuredAverage(days, "resting_heart_rate");
  const scoreValues = input.scores
    .filter((item) => item.kind === "recovery" && finite(item.score) && (!latest || item.score_date <= latest.metric_date))
    .slice(-RECOVERY_DAYS)
    .map((item) => item.score as number);
  const driverCoverage = Number(drivers.coverage);
  const coverage = Number.isFinite(driverCoverage)
    ? Math.min(1, Math.max(0, driverCoverage))
    : latest
      ? [latest.hrv_ms, latest.resting_heart_rate, drivers.sleep].filter(finite).length / 3
      : 0;
  const score = finite(scoreDay?.score)
    && finite(drivers.hrv)
    && finite(drivers.restingHeartRate)
    && finite(drivers.sleep)
    && coverage === 1
    ? scoreDay.score
    : null;
  const measuredAt = latest?.source_freshness?.latestMeasuredAt ?? null;
  const freshness = calculateSignalFreshness({ measuredAt, importedAt: input.importedAt, coverage });

  return {
    timezone: input.timezone,
    periodDays: RECOVERY_DAYS,
    latestDate: latest?.metric_date ?? null,
    freshness,
    score: {
      value: score,
      reason: recoveryReason({
        latest,
        score,
        drivers,
        hrvHistory: hrvReference.measuredDays,
        restingHeartRateHistory: restingHeartRateReference.measuredDays,
      }),
      average: scoreValues.length ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : null,
      measuredDays: scoreValues.length,
      coverage,
      algorithmVersion: scoreDay?.algorithm_version ?? null,
      components: {
        hrv: { value: finite(drivers.hrv) ? drivers.hrv : null, weight: 0.4 },
        restingHeartRate: { value: finite(drivers.restingHeartRate) ? drivers.restingHeartRate : null, weight: 0.3 },
        sleep: { value: finite(drivers.sleep) ? drivers.sleep : null, weight: 0.3 },
      },
    },
    signals: {
      hrv: {
        current: finite(latest?.hrv_ms) ? latest.hrv_ms : null,
        reference: hrvReference.value,
        measuredDays: hrvReference.measuredDays,
        unit: "ms",
      },
      restingHeartRate: {
        current: finite(latest?.resting_heart_rate) ? latest.resting_heart_rate : null,
        reference: restingHeartRateReference.value,
        measuredDays: restingHeartRateReference.measuredDays,
        unit: "bpm",
      },
    },
    trends: {
      hrv: days.map((day) => ({ date: day.metric_date, value: finite(day.hrv_ms) ? day.hrv_ms : null })),
      restingHeartRate: days.map((day) => ({ date: day.metric_date, value: finite(day.resting_heart_rate) ? day.resting_heart_rate : null })),
    },
    provenance: {
      measurements: { kind: "health_source" as const, label: "Sources santé importées" },
      score: { kind: "soma_calculation" as const, label: "Calcul Soma" },
    },
  };
}

export async function getNativeRecovery(userId: string) {
  const database = createCloudflareAdminClient();
  const [profileResult, metricsResult, scoresResult, connectionResult] = await Promise.all([
    database.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    database.from("daily_health_metrics").select(METRIC_COLUMNS).eq("user_id", userId).order("metric_date", { ascending: false }).limit(RECOVERY_DAYS),
    database.from("daily_scores").select("score_date,kind,score,drivers,algorithm_version").eq("user_id", userId).eq("kind", "recovery").order("score_date", { ascending: false }).limit(RECOVERY_DAYS),
    database.from("provider_connections").select("last_synced_at").eq("user_id", userId).eq("provider", "google_health").maybeSingle(),
  ]);
  const failure = [profileResult, metricsResult, scoresResult].find((result) => result.error);
  if (failure?.error) throw new Error("Recovery data is temporarily unavailable.");

  return buildNativeRecoveryResponse({
    timezone: profileResult.data?.timezone ?? "Europe/Paris",
    importedAt: connectionResult.error ? null : connectionResult.data?.last_synced_at ?? null,
    days: (metricsResult.data ?? []) as unknown as RecoveryMetric[],
    scores: (scoresResult.data ?? []) as unknown as ScoreDay[],
  });
}
