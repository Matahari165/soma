import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { aggregateConfirmedMeals, type MealDailyAggregate } from "@/domain/lab/meals";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { exerciseSummaryFromRecord, type ExerciseSummary, type HealthMetricDay, type ScoreDay } from "@/services/health-analytics";
import { loadConfirmedMealRecords } from "@/services/meals";

import {
  assistantActivityTypeFilterValues,
  assistantActivityTypeMatches,
  assistantHealthMetricCatalog,
} from "./health-catalog";

import {
  assistantSemanticQuerySchema,
  type AssistantSemanticQuery,
} from "../contracts";

type AssistantAvailability = "observed" | "partial" | "missing" | "not_calculable";
type AssistantFreshness = "current" | "partial" | "stale" | "missing";

export type AssistantObservation = {
  metric: string;
  value: number | string | boolean | null;
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
  totalItems: number | null;
  totalKnown: boolean;
  returnedItems: number;
  hasMore: boolean;
  nextCursor: string | null;
  complete: boolean;
  generatedAt: string;
};

export type AssistantSemanticResult = { items: AssistantSemanticRecord[]; manifest: AssistantQueryManifest };

export type AssistantDataSources = {
  profile(userId: string): Promise<{ timezone: string; importedAt: string | null }>;
  health(userId: string, period: { from: string; to: string }, metrics: string[], page: AssistantPageRequest): Promise<HealthMetricDay[] | AssistantSourcePage<HealthMetricDay>>;
  scores(userId: string, period: { from: string; to: string }, kinds: ScoreDay["kind"][], page: AssistantPageRequest): Promise<ScoreDay[] | AssistantSourcePage<ScoreDay>>;
  nutrition(userId: string, period: { from: string; to: string }): Promise<MealDailyAggregate[]>;
  activities(userId: string, period: { from: string; to: string }, activityTypes: string[], page: AssistantPageRequest): Promise<ExerciseSummary[] | AssistantSourcePage<ExerciseSummary>>;
};

export type AssistantPageRequest = { limit: number; position: string | null; order: "asc" | "desc" };
export type AssistantSourcePage<T> = { items: T[]; hasMore: boolean; nextPosition: string | null; totalItems: number | null };

type CursorPayload = { version: 1; dataset: AssistantSemanticQuery["dataset"]; queryHash: string; position: string };

const MAX_PERIOD_DAYS = 3_660;
const healthMetricMetadata = new Map<string, (typeof assistantHealthMetricCatalog)[number]>(assistantHealthMetricCatalog.map((metric) => [metric.key, metric]));

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

function queryHash(query: AssistantSemanticQuery, userId: string) {
  const filters = query.dataset === "daily_health" || query.dataset === "nutrition_daily"
    ? query.metrics
    : query.dataset === "scores"
      ? query.kinds
      : query.activityTypes;
  return createHash("sha256").update(JSON.stringify({
    userId,
    dataset: query.dataset,
    period: query.period,
    filters,
    order: query.pagination.order,
  })).digest("hex");
}

function pageOffset(position: string | null) {
  if (position === null) return 0;
  const offset = Number(position);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Assistant cursor has an invalid page offset.");
  return offset;
}

function activityOffsets(position: string | null) {
  if (position === null) return { civilDate: 0, startTime: 0 };
  try {
    const parsed = JSON.parse(position) as Partial<{ civilDate: number; startTime: number }>;
    const civilDate = parsed.civilDate;
    const startTime = parsed.startTime;
    if (!Number.isSafeInteger(civilDate) || !Number.isSafeInteger(startTime) || (civilDate ?? -1) < 0 || (startTime ?? -1) < 0) throw new Error();
    return { civilDate: civilDate as number, startTime: startTime as number };
  } catch {
    throw new Error("Assistant cursor has an invalid activity position.");
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
  async health(userId, period, metrics, pageRequest) {
    const admin = createCloudflareAdminClient();
    const selectedMetrics = assistantHealthMetricCatalog.filter((metric) => metrics.includes(metric.key)).map((metric) => metric.key);
    let query = admin.from("daily_health_metrics").select(["metric_date", "source_freshness", "data_quality", ...selectedMetrics].join(","))
      .eq("user_id", userId).gte("metric_date", period.from).lte("metric_date", period.to);
    if (pageRequest.position) query = pageRequest.order === "asc"
      ? query.gt("metric_date", pageRequest.position)
      : query.lt("metric_date", pageRequest.position);
    const result = await query.order("metric_date", { ascending: pageRequest.order === "asc" }).range(0, pageRequest.limit);
    if (result.error) throw new Error("Assistant daily health data could not be loaded.");
    const rows = (result.data ?? []) as unknown as HealthMetricDay[];
    const items = rows.slice(0, pageRequest.limit);
    const hasMore = rows.length > items.length;
    return { items, hasMore, nextPosition: hasMore ? items.at(-1)?.metric_date ?? null : null, totalItems: null };
  },
  async scores(userId, period, kinds, pageRequest) {
    const offset = pageOffset(pageRequest.position);
    const result = await createCloudflareAdminClient().from("daily_scores").select("score_date,kind,score,algorithm_version")
      .eq("user_id", userId).gte("score_date", period.from).lte("score_date", period.to).in("kind", kinds)
      .order("score_date", { ascending: pageRequest.order === "asc" }).order("kind", { ascending: pageRequest.order === "asc" })
      .range(offset, offset + pageRequest.limit);
    if (result.error) throw new Error("Assistant score data could not be loaded.");
    const rows = (result.data ?? []) as unknown as ScoreDay[];
    const items = rows.slice(0, pageRequest.limit);
    const hasMore = rows.length > items.length;
    return { items, hasMore, nextPosition: hasMore ? String(offset + items.length) : null, totalItems: null };
  },
  async nutrition(userId, period) {
    return aggregateConfirmedMeals(await loadConfirmedMealRecords(userId, period));
  },
  async activities(userId, period, activityTypes, pageRequest) {
    const admin = createCloudflareAdminClient();
    const nativeTypes = assistantActivityTypeFilterValues(activityTypes);
    const offsets = activityOffsets(pageRequest.position);
    const endExclusive = new Date(Date.parse(`${period.to}T00:00:00.000Z`) + 86_400_000).toISOString();
    const queryDate = async (field: "civil_date" | "start_time", offset: number) => {
      let query = admin.from("health_records").select("source_record_id,civil_date,start_time,end_time,payload")
        .eq("user_id", userId).eq("data_type", "exercise");
      if (field === "civil_date") query = query.gte("civil_date", period.from).lte("civil_date", period.to);
      else query = query.is("civil_date", null).gte("start_time", `${period.from}T00:00:00.000Z`).lt("start_time", endExclusive);
      if (nativeTypes.length) query = query.in("payload.exercise.exerciseType", nativeTypes);
      let ordered = query.order(field, { ascending: pageRequest.order === "asc" });
      if (field !== "start_time") ordered = ordered.order("start_time", { ascending: pageRequest.order === "asc" });
      const result = await ordered.order("source_record_id", { ascending: pageRequest.order === "asc" })
        .range(offset, offset + pageRequest.limit);
      if (result.error) throw new Error("Exercise history could not be loaded.");
      const rows = (result.data ?? []) as Array<Record<string, unknown>>;
      return {
        items: rows.slice(0, pageRequest.limit).map((row) => exerciseSummaryFromRecord(row as Parameters<typeof exerciseSummaryFromRecord>[0])),
        hasMore: rows.length > pageRequest.limit,
      };
    };
    const [civilDate, startTime] = await Promise.all([
      queryDate("civil_date", offsets.civilDate), queryDate("start_time", offsets.startTime),
    ]);
    const combined = [
      ...civilDate.items.filter((item) => assistantActivityTypeMatches(item.type, activityTypes)).map((item) => ({ source: "civilDate" as const, item })),
      ...startTime.items.filter((item) => assistantActivityTypeMatches(item.type, activityTypes)).map((item) => ({ source: "startTime" as const, item })),
    ].sort((left, right) => activityPosition(left.item).localeCompare(activityPosition(right.item)) * (pageRequest.order === "asc" ? 1 : -1));
    const selected = combined.slice(0, pageRequest.limit);
    const consumed = {
      civilDate: selected.filter((entry) => entry.source === "civilDate").length,
      startTime: selected.filter((entry) => entry.source === "startTime").length,
    };
    const hasMore = combined.length > pageRequest.limit || civilDate.hasMore || startTime.hasMore;
    const nextPosition = hasMore ? JSON.stringify({
      civilDate: offsets.civilDate + consumed.civilDate,
      startTime: offsets.startTime + consumed.startTime,
    }) : null;
    return { items: selected.map((entry) => entry.item), hasMore, nextPosition, totalItems: null };
  },
};

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function healthMetricValue(day: HealthMetricDay, metric: string) {
  const metadata = healthMetricMetadata.get(metric);
  const value = (day as unknown as Record<string, unknown>)[metric];
  if (value == null) return null;
  if (metadata?.format === "boolean") return typeof value === "boolean" ? value : null;
  if (metadata?.format === "clock") return typeof value === "string" ? value : null;
  return finiteNumber(value);
}

function healthMeasuredAt(day: HealthMetricDay, metric: string) {
  const sourceTypes = healthMetricMetadata.get(metric)?.sourceDataTypes ?? [];
  const measuredAt = sourceTypes.map((type) => day.source_freshness?.byType?.[type])
    .filter((value): value is string => typeof value === "string")
    .sort();
  return measuredAt.at(-1) ?? null;
}

function availability(value: AssistantObservation["value"], coverage: number): AssistantAvailability {
  if (value === null) return coverage > 0 ? "partial" : "missing";
  return coverage < 1 ? "partial" : "observed";
}

function healthRecords(rows: HealthMetricDay[], query: Extract<AssistantSemanticQuery, { dataset: "daily_health" }>, importedAt: string | null): AssistantDailyRecord[] {
  return rows.filter((day) => day.metric_date >= query.period.from && day.metric_date <= query.period.to).map((day) => {
    return {
      type: "daily" as const,
      date: day.metric_date,
      observations: query.metrics.map((metric) => {
        const value = healthMetricValue(day, metric);
        const metadata = healthMetricMetadata.get(metric);
        const coverage = value === null ? 0 : 1;
        const measuredAt = healthMeasuredAt(day, metric);
        const providers = day.data_quality?.providers ?? [];
        const provider = providers.length === 1 ? providers[0] ?? null : null;
        const metricImportedAt = day.data_quality?.importedAt
          ?? (provider?.toLocaleLowerCase("en-US").includes("google") ? importedAt : null);
        const freshness = value === null ? "missing" : measuredAt
          ? calculateSignalFreshness({ measuredAt, importedAt: metricImportedAt, coverage }).state
          : "partial";
        const metricAvailability = value === null && metadata?.source === "soma_calculation"
          ? "not_calculable"
          : availability(value, coverage);
        return {
          metric, value, unit: metadata?.unit ?? null, availability: metricAvailability, coverage,
          measuredAt, importedAt: metricImportedAt, freshness,
          provenance: { source: metadata?.source ?? "health_source", provider, algorithmVersion: null },
        };
      }),
    };
  });
}

function scoreRecords(rows: ScoreDay[], query: Extract<AssistantSemanticQuery, { dataset: "scores" }>, importedAt: string | null): AssistantScoreRecord[] {
  const kinds = new Set(query.kinds);
  return rows.filter((row) => kinds.has(row.kind) && row.score_date >= query.period.from && row.score_date <= query.period.to).map((row) => {
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
  return rows.filter((day) => day.date >= query.period.from && day.date <= query.period.to).map((day) => ({
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
  return rows.filter((activity) => activity.date >= query.period.from && activity.date <= query.period.to && assistantActivityTypeMatches(activity.type, query.activityTypes))
    .map((activity) => ({ type: "activity" as const, date: activity.date, activity }));
}

function recordPosition(record: AssistantSemanticRecord) {
  return record.type === "score" ? `${record.date}|${record.kind}` : record.type === "activity" ? activityPosition(record.activity) : record.date;
}

function activityPosition(activity: ExerciseSummary) {
  return `${activity.date}|${activity.startTime ?? "~"}|${activity.id}`;
}

function paginate(records: AssistantSemanticRecord[], query: AssistantSemanticQuery, userId: string, explicitSecret?: string) {
  const direction = query.pagination.order === "asc" ? 1 : -1;
  const sorted = [...records].sort((left, right) => recordPosition(left).localeCompare(recordPosition(right)) * direction);
  const fingerprint = queryHash(query, userId);
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
  const fingerprint = queryHash(query, userId);
  const cursor = query.pagination.cursor
    ? decodeAssistantCursor(query.pagination.cursor, query.dataset, options.cursorSecret, fingerprint)
    : null;
  const pageRequest: AssistantPageRequest = {
    limit: query.pagination.limit,
    position: cursor?.position ?? null,
    order: query.pagination.order,
  };

  let records: AssistantSemanticRecord[];
  let paginated: { page: AssistantSemanticRecord[]; total: number | null; totalKnown: boolean; hasMore: boolean; nextCursor: string | null };
  if (query.dataset === "daily_health") {
    const sourceResult = await sources.health(userId, query.period, query.metrics, pageRequest);
    if (Array.isArray(sourceResult)) {
      records = healthRecords(sourceResult, query, profile.importedAt);
      const legacy = paginate(records, query, userId, options.cursorSecret);
      paginated = { ...legacy, totalKnown: true };
    } else {
      records = healthRecords(sourceResult.items, query, profile.importedAt);
      paginated = {
        page: records, total: sourceResult.totalItems, totalKnown: sourceResult.totalItems !== null,
        hasMore: sourceResult.hasMore,
        nextCursor: sourceResult.hasMore && sourceResult.nextPosition
          ? encodeAssistantCursor({ version: 1, dataset: query.dataset, queryHash: fingerprint, position: sourceResult.nextPosition }, options.cursorSecret)
          : null,
      };
    }
  } else if (query.dataset === "scores") {
    const sourceResult = await sources.scores(userId, query.period, query.kinds, pageRequest);
    if (Array.isArray(sourceResult)) {
      records = scoreRecords(sourceResult, query, profile.importedAt);
      const legacy = paginate(records, query, userId, options.cursorSecret);
      paginated = { ...legacy, totalKnown: true };
    } else {
      records = scoreRecords(sourceResult.items, query, profile.importedAt);
      paginated = {
        page: records, total: sourceResult.totalItems, totalKnown: sourceResult.totalItems !== null,
        hasMore: sourceResult.hasMore,
        nextCursor: sourceResult.hasMore && sourceResult.nextPosition
          ? encodeAssistantCursor({ version: 1, dataset: query.dataset, queryHash: fingerprint, position: sourceResult.nextPosition }, options.cursorSecret)
          : null,
      };
    }
  } else if (query.dataset === "nutrition_daily") {
    records = nutritionRecords(await sources.nutrition(userId, query.period), query);
    const legacy = paginate(records, query, userId, options.cursorSecret);
    paginated = { ...legacy, totalKnown: true };
  } else {
    const sourceResult = await sources.activities(userId, query.period, query.activityTypes, pageRequest);
    if (Array.isArray(sourceResult)) {
      records = activityRecords(sourceResult, query);
      const legacy = paginate(records, query, userId, options.cursorSecret);
      paginated = { ...legacy, totalKnown: true };
    } else {
      records = activityRecords(sourceResult.items, query);
      paginated = {
        page: records, total: sourceResult.totalItems, totalKnown: sourceResult.totalItems !== null,
        hasMore: sourceResult.hasMore,
        nextCursor: sourceResult.hasMore && sourceResult.nextPosition
          ? encodeAssistantCursor({ version: 1, dataset: query.dataset, queryHash: fingerprint, position: sourceResult.nextPosition }, options.cursorSecret)
          : null,
      };
    }
  }

  const coveredDates = records.map((record) => record.date).sort();
  return {
    items: paginated.page,
    manifest: {
      dataset: query.dataset,
      requestedPeriod: query.period,
      coveredPeriod: coveredDates.length ? { from: coveredDates[0], to: coveredDates.at(-1) as string } : null,
      timezone: profile.timezone,
      totalItems: paginated.total,
      totalKnown: paginated.totalKnown,
      returnedItems: paginated.page.length,
      hasMore: paginated.hasMore,
      nextCursor: paginated.nextCursor,
      complete: !paginated.hasMore,
      generatedAt: (options.now ?? new Date()).toISOString(),
    },
  };
}
