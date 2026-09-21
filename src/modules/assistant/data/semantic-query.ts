import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { aggregateConfirmedMeals, type MealDailyAggregate } from "@/domain/lab/meals";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { allImportedExercises, type ExerciseSummary, type HealthMetricDay, type ScoreDay } from "@/services/health-analytics";
import { loadConfirmedMealRecords } from "@/services/meals";

import {
  assistantSemanticQuerySchema,
  type AssistantSemanticQuery,
} from "../contracts";

type AssistantAvailability = "observed" | "partial" | "missing" | "not_calculable";
type AssistantFreshness = "current" | "partial" | "stale" | "missing";

export type AssistantObservation = {
  metric: string;
  value: number | null;
  unit: string | null;
  availability: AssistantAvailability;
  coverage: number;
  measuredAt: string | null;
  importedAt: string | null;
  freshness: AssistantFreshness;
  provenance: {
    source: "confirmed_meals" | "health_source" | "soma_calculation";
    provider: string | null;
    algorithmVersion: string | null;
  };
};

export type AssistantDailyRecord = { type: "daily"; date: string; observations: AssistantObservation[] };
export type AssistantScoreRecord = { type: "score"; date: string; kind: ScoreDay["kind"]; observation: AssistantObservation };
export type AssistantActivityRecord = { type: "activity"; date: string; activity: ExerciseSummary };
export type AssistantSemanticRecord = AssistantDailyRecord | AssistantScoreRecord | AssistantActivityRecord;

export type AssistantQueryManifest = {
  dataset: AssistantSemanticQuery["dataset"];
  requestedPeriod: { from: string; to: string };
  coveredPeriod: { from: string; to: string } | null;
  timezone: string;
  totalItems: number;
  returnedItems: number;
  hasMore: boolean;
  nextCursor: string | null;
  complete: boolean;
  generatedAt: string;
};

export type AssistantSemanticResult = { items: AssistantSemanticRecord[]; manifest: AssistantQueryManifest };

type AssistantDataSources = {
  profile(userId: string): Promise<{ timezone: string; importedAt: string | null }>;
  health(userId: string, period: { from: string; to: string }): Promise<HealthMetricDay[]>;
  scores(userId: string, period: { from: string; to: string }): Promise<ScoreDay[]>;
  nutrition(userId: string, period: { from: string; to: string }): Promise<MealDailyAggregate[]>;
  activities(userId: string, period: { from: string; to: string }): Promise<ExerciseSummary[]>;
};

type CursorPayload = { version: 1; dataset: AssistantSemanticQuery["dataset"]; queryHash: string; position: string };

const MAX_PERIOD_DAYS = 3_660;
const STORAGE_PAGE_SIZE = 500;

const healthMetricMetadata: Record<string, { unit: string | null; source: AssistantObservation["provenance"]["source"] }> = {
  sleep_minutes: { unit: "min", source: "soma_calculation" },
  sleep_need_minutes: { unit: "min", source: "soma_calculation" },
  sleep_efficiency: { unit: "%", source: "soma_calculation" },
  sleep_regularity: { unit: "%", source: "soma_calculation" },
  sleep_latency_minutes: { unit: "min", source: "health_source" },
  sleep_awake_minutes: { unit: "min", source: "health_source" },
  sleep_deep_minutes: { unit: "min", source: "health_source" },
  sleep_rem_minutes: { unit: "min", source: "health_source" },
  daily_sleep_debt_minutes: { unit: "min", source: "soma_calculation" },
  cumulative_sleep_debt_minutes: { unit: "min", source: "soma_calculation" },
  hrv_ms: { unit: "ms", source: "health_source" },
  resting_heart_rate: { unit: "bpm", source: "health_source" },
  respiratory_rate: { unit: "breaths/min", source: "health_source" },
  oxygen_saturation: { unit: "%", source: "health_source" },
  skin_temperature_delta: { unit: "°C", source: "health_source" },
  steps: { unit: "steps", source: "health_source" },
  active_energy_kcal: { unit: "kcal", source: "health_source" },
  total_energy_kcal: { unit: "kcal", source: "health_source" },
  zone_minutes: { unit: "min", source: "health_source" },
  active_minutes: { unit: "min", source: "health_source" },
  exercise_minutes: { unit: "min", source: "health_source" },
  distance_km: { unit: "km", source: "health_source" },
  running_distance_km: { unit: "km", source: "soma_calculation" },
  running_duration_minutes: { unit: "min", source: "soma_calculation" },
  running_pace_seconds_per_km: { unit: "s/km", source: "soma_calculation" },
  running_average_heart_rate: { unit: "bpm", source: "soma_calculation" },
  weight_kg: { unit: "kg", source: "health_source" },
  body_fat_percent: { unit: "%", source: "health_source" },
  vo2_max: { unit: "ml/kg/min", source: "health_source" },
  weekly_load: { unit: "load", source: "soma_calculation" },
  acute_chronic_load_ratio: { unit: "ratio", source: "soma_calculation" },
};

const nutritionMetricMetadata: Record<string, { field: keyof MealDailyAggregate; unit: string | null }> = {
  calories_kcal: { field: "caloriesKcal", unit: "kcal" },
  protein_g: { field: "proteinG", unit: "g" },
  carbs_g: { field: "carbsG", unit: "g" },
  fat_g: { field: "fatG", unit: "g" },
  fiber_g: { field: "fiberG", unit: "g" },
  sugar_g: { field: "sugarG", unit: "g" },
  added_sugar_g: { field: "addedSugarG", unit: "g" },
  meal_count: { field: "mealCount", unit: "meals" },
  meal_coverage: { field: "mealCoverage", unit: "%" },
  analysis_coverage: { field: "analysisCoverage", unit: "%" },
  analysis_confidence: { field: "analysisConfidence", unit: "%" },
  food_variety_count: { field: "foodVarietyCount", unit: "foods" },
  food_group_count: { field: "foodGroupCount", unit: "groups" },
};

function periodDays(period: { from: string; to: string }) {
  return Math.floor((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000) + 1;
}

function cursorSecret(explicit?: string) {
  const secret = explicit ?? process.env.SOMA_ASSISTANT_CURSOR_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) throw new Error("Assistant cursor signing is not configured.");
  return secret;
}

export function encodeAssistantCursor(payload: CursorPayload, explicitSecret?: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", cursorSecret(explicitSecret)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function decodeAssistantCursor(value: string, dataset: AssistantSemanticQuery["dataset"], explicitSecret?: string, expectedQueryHash?: string): CursorPayload {
  const [body, suppliedSignature, extra] = value.split(".");
  if (!body || !suppliedSignature || extra) throw new Error("Invalid assistant cursor.");
  const expectedSignature = createHmac("sha256", cursorSecret(explicitSecret)).update(body).digest();
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedSignature, "base64url");
  } catch {
    throw new Error("Invalid assistant cursor.");
  }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) throw new Error("Invalid assistant cursor signature.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid assistant cursor payload.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid assistant cursor payload.");
  const candidate = parsed as Partial<CursorPayload>;
  if (candidate.version !== 1 || candidate.dataset !== dataset || typeof candidate.queryHash !== "string" || !candidate.queryHash || typeof candidate.position !== "string" || !candidate.position) throw new Error("Assistant cursor does not match this query.");
  if (expectedQueryHash && candidate.queryHash !== expectedQueryHash) throw new Error("Assistant cursor does not match this query.");
  return candidate as CursorPayload;
}

function queryHash(query: AssistantSemanticQuery) {
  const filters = query.dataset === "daily_health" || query.dataset === "nutrition_daily"
    ? query.metrics
    : query.dataset === "scores"
      ? query.kinds
      : query.activityTypes;
  return createHash("sha256").update(JSON.stringify({
    dataset: query.dataset,
    period: query.period,
    filters,
    order: query.pagination.order,
  })).digest("hex");
}

async function readAllRows(table: string, userId: string, period: { from: string; to: string }, dateField: string) {
  const admin = createCloudflareAdminClient();
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const result = await admin.from(table).select("*").eq("user_id", userId).gte(dateField, period.from).lte(dateField, period.to)
      .order(dateField, { ascending: true }).range(offset, offset + STORAGE_PAGE_SIZE - 1);
    if (result.error) throw new Error(`Assistant ${table} data could not be loaded.`);
    const page = (result.data ?? []) as Array<Record<string, unknown>>;
    rows.push(...page);
    if (page.length < STORAGE_PAGE_SIZE) return rows;
  }
}

const defaultSources: AssistantDataSources = {
  async profile(userId) {
    const admin = createCloudflareAdminClient();
    const [profileResult, connectionResult] = await Promise.all([
      admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      admin.from("provider_connections").select("last_synced_at").eq("user_id", userId).eq("provider", "google_health").maybeSingle(),
    ]);
    if (profileResult.error) throw new Error("Assistant profile context could not be loaded.");
    return { timezone: profileResult.data?.timezone ?? "Europe/Paris", importedAt: connectionResult.data?.last_synced_at ?? null };
  },
  async health(userId, period) {
    return await readAllRows("daily_health_metrics", userId, period, "metric_date") as unknown as HealthMetricDay[];
  },
  async scores(userId, period) {
    return await readAllRows("daily_scores", userId, period, "score_date") as unknown as ScoreDay[];
  },
  async nutrition(userId, period) {
    return aggregateConfirmedMeals(await loadConfirmedMealRecords(userId, period));
  },
  async activities(userId, period) {
    return (await allImportedExercises(userId)).filter((activity) => activity.date >= period.from && activity.date <= period.to);
  },
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function healthMeasuredAt(day: HealthMetricDay) {
  const latest = day.source_freshness?.latestMeasuredAt;
  return typeof latest === "string" ? latest : null;
}

function availability(value: number | null, coverage: number): AssistantAvailability {
  if (value === null) return coverage > 0 ? "partial" : "missing";
  return coverage < 1 ? "partial" : "observed";
}

function healthRecords(rows: HealthMetricDay[], query: Extract<AssistantSemanticQuery, { dataset: "daily_health" }>, importedAt: string | null): AssistantDailyRecord[] {
  return rows.map((day) => {
    const measuredAt = healthMeasuredAt(day);
    const freshness = calculateSignalFreshness({ measuredAt, importedAt, coverage: measuredAt ? 1 : 0 });
    return {
      type: "daily" as const,
      date: day.metric_date,
      observations: query.metrics.map((metric) => {
        const value = finiteNumber(day[metric]);
        const metadata = healthMetricMetadata[metric];
        const coverage = value === null ? 0 : 1;
        const metricAvailability = value === null && metadata?.source === "soma_calculation"
          ? "not_calculable"
          : availability(value, coverage);
        return {
          metric, value, unit: metadata?.unit ?? null, availability: metricAvailability, coverage,
          measuredAt, importedAt, freshness: freshness.state,
          provenance: { source: metadata?.source ?? "health_source", provider: null, algorithmVersion: metadata?.source === "soma_calculation" ? "daily-health-metrics" : null },
        };
      }),
    };
  });
}

function scoreRecords(rows: ScoreDay[], query: Extract<AssistantSemanticQuery, { dataset: "scores" }>, importedAt: string | null): AssistantScoreRecord[] {
  const kinds = new Set(query.kinds);
  return rows.filter((row) => kinds.has(row.kind)).map((row) => {
    const value = finiteNumber(row.score);
    return {
      type: "score" as const, date: row.score_date, kind: row.kind,
      observation: {
        metric: `${row.kind}_score`, value, unit: "/100", availability: value === null ? "not_calculable" : "observed",
        coverage: value === null ? 0 : 1, measuredAt: null, importedAt,
        freshness: value === null ? "missing" : "partial",
        provenance: { source: "soma_calculation", provider: null, algorithmVersion: row.algorithm_version ?? null },
      },
    };
  });
}

function nutritionRecords(rows: MealDailyAggregate[], query: Extract<AssistantSemanticQuery, { dataset: "nutrition_daily" }>): AssistantDailyRecord[] {
  return rows.map((day) => ({
    type: "daily" as const,
    date: day.date,
    observations: query.metrics.map((metric) => {
      const metadata = nutritionMetricMetadata[metric];
      const value = metadata ? finiteNumber(day[metadata.field]) : null;
      const nutritionCoverage = day.analysisCoverage === null ? 0 : Math.max(0, Math.min(1, day.analysisCoverage / 100));
      const coverage = metric === "meal_count" || metric === "meal_coverage" ? 1 : nutritionCoverage;
      return {
        metric, value, unit: metadata?.unit ?? null, availability: availability(value, coverage), coverage,
        measuredAt: null, importedAt: null, freshness: value === null ? "missing" : coverage < 1 ? "partial" : "current",
        provenance: { source: "confirmed_meals", provider: null, algorithmVersion: "confirmed-meals-v1" },
      };
    }),
  }));
}

function activityRecords(rows: ExerciseSummary[], query: Extract<AssistantSemanticQuery, { dataset: "activities" }>): AssistantActivityRecord[] {
  const types = new Set(query.activityTypes.map((value) => value.toLocaleUpperCase("en-US")));
  return rows.filter((activity) => !types.size || types.has(activity.type.toLocaleUpperCase("en-US")))
    .map((activity) => ({ type: "activity" as const, date: activity.date, activity }));
}

function recordPosition(record: AssistantSemanticRecord) {
  return record.type === "score" ? `${record.date}|${record.kind}` : record.type === "activity" ? `${record.date}|${record.activity.id}` : record.date;
}

function paginate(records: AssistantSemanticRecord[], query: AssistantSemanticQuery, explicitSecret?: string) {
  const direction = query.pagination.order === "asc" ? 1 : -1;
  const sorted = [...records].sort((left, right) => recordPosition(left).localeCompare(recordPosition(right)) * direction);
  const fingerprint = queryHash(query);
  const cursor = query.pagination.cursor ? decodeAssistantCursor(query.pagination.cursor, query.dataset, explicitSecret, fingerprint) : null;
  const eligible = cursor ? sorted.filter((record) => recordPosition(record).localeCompare(cursor.position) * direction > 0) : sorted;
  const page = eligible.slice(0, query.pagination.limit);
  const hasMore = eligible.length > page.length;
  const last = page.at(-1);
  return {
    page,
    total: sorted.length,
    hasMore,
    nextCursor: hasMore && last ? encodeAssistantCursor({ version: 1, dataset: query.dataset, queryHash: fingerprint, position: recordPosition(last) }, explicitSecret) : null,
  };
}

export async function queryAssistantData(
  userId: string,
  input: unknown,
  options: { sources?: AssistantDataSources; cursorSecret?: string; now?: Date } = {},
): Promise<AssistantSemanticResult> {
  if (!userId) throw new Error("Authenticated user is required.");
  const query = assistantSemanticQuerySchema.parse(input);
  if (periodDays(query.period) > MAX_PERIOD_DAYS) throw new Error(`Assistant queries are limited to ${MAX_PERIOD_DAYS} days per request.`);
  const sources = options.sources ?? defaultSources;
  const profile = await sources.profile(userId);

  let records: AssistantSemanticRecord[];
  if (query.dataset === "daily_health") records = healthRecords(await sources.health(userId, query.period), query, profile.importedAt);
  else if (query.dataset === "scores") records = scoreRecords(await sources.scores(userId, query.period), query, profile.importedAt);
  else if (query.dataset === "nutrition_daily") records = nutritionRecords(await sources.nutrition(userId, query.period), query);
  else records = activityRecords(await sources.activities(userId, query.period), query);

  const paginated = paginate(records, query, options.cursorSecret);
  const coveredDates = records.map((record) => record.date).sort();
  return {
    items: paginated.page,
    manifest: {
      dataset: query.dataset,
      requestedPeriod: query.period,
      coveredPeriod: coveredDates.length ? { from: coveredDates[0], to: coveredDates.at(-1) as string } : null,
      timezone: profile.timezone,
      totalItems: paginated.total,
      returnedItems: paginated.page.length,
      hasMore: paginated.hasMore,
      nextCursor: paginated.nextCursor,
      complete: !paginated.hasMore,
      generatedAt: (options.now ?? new Date()).toISOString(),
    },
  };
}
