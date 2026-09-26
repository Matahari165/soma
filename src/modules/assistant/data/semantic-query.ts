import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { aggregateConfirmedMeals, type MealDailyAggregate } from "@/domain/lab/meals";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import type { Meal } from "@/domain/meals";

import { exerciseSummaryFromRecord, type ExerciseSummary, type HealthMetricDay, type ScoreDay } from "@/services/health-analytics";
import { loadConfirmedMealRecords } from "@/services/meals";
import { listMeals } from "@/repositories/meals";

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
export type AssistantActivitySource = {
  activity: ExerciseSummary;
  provider: string | null;
  startTime: string | null;
  endTime: string | null;
  importedAt: string | null;
  paceSource?: "health_source" | "soma_calculation";
};
export type AssistantActivityRecord = { type: "activity"; date: string; activity: ExerciseSummary; startTime: string | null; endTime: string | null; qualityFlags: Array<"zone_minutes_exceed_duration" | "active_minutes_exceed_duration">; observations: AssistantObservation[] };
export type AssistantSleepSessionSource = { provider: string | null; sourceDevice: string | null; sourceRecordId: string; civilDate: string | null; startTime: string | null; endTime: string | null; updatedAt: string | null; payload: unknown };
type HealthRecordRow = { provider: unknown; source_device: unknown; source_record_id: unknown; civil_date: unknown; start_time: unknown; end_time: unknown; updated_at: unknown; payload: unknown };
export type AssistantSleepSessionRecord = { type: "sleep_session"; date: string; session: {
  id: string; startTime: string | null; endTime: string | null; durationMinutes: number | null;
  sleepMinutes: number | null; minutesInSleepPeriod: number | null; minutesAwake: number | null;
  minutesToFallAsleep: number | null; stages: Array<{ type: string; startTime: string | null; endTime: string | null; durationMinutes: number | null }>;
  stagesSummary: Array<{ type: string; minutes: number | null; count: number | null }>;
  sourceDevice: string | null; provider: string | null; importedAt: string | null;
}; observations: AssistantObservation[] };
type AssistantMealRange = { low: number | null; likely: number | null; high: number | null } | null;
type AssistantMealTotals = {
  calories: AssistantMealRange; proteinGrams: AssistantMealRange; carbohydrateGrams: AssistantMealRange;
  fatGrams: AssistantMealRange; fiberGrams: AssistantMealRange; sugarGrams: AssistantMealRange; addedSugarGrams: AssistantMealRange;
};
export type AssistantMealRecord = { type: "meal"; date: string; meal: {
  id: string; mealType: Meal["mealType"]; status: Meal["status"]; entryState: Meal["entryState"];
  nutritionEligible: boolean; nutritionExclusionReason: "draft" | "explicitly_skipped" | null;
  note: string | null; origin: "homemade" | "prepared" | "mixed" | "unknown"; recordedAt: string;
  analysis: { status: string; provider: string | null; model: string | null; confidence: string | null; coverage: number; totals: AssistantMealTotals; foods: Array<{
    id: string | null; name: string; preparation: string | null; portion: string | null; estimatedGrams: number | null;
    quantity: unknown; kind: unknown; parentId: string | null; course: unknown; countedInTotals: boolean | null;
    calories: AssistantMealRange; proteinGrams: AssistantMealRange; carbohydrateGrams: AssistantMealRange;
    fatGrams: AssistantMealRange; fiberGrams: AssistantMealRange; sugarGrams: AssistantMealRange;
    addedSugarGrams: AssistantMealRange; confidence: string | null;
  }> } | null;
  provenance: { source: "confirmed_meals"; provider: string | null; algorithmVersion: string | null };
}; observations: AssistantObservation[] };
export type AssistantSemanticRecord = AssistantDailyRecord | AssistantScoreRecord | AssistantActivityRecord | AssistantSleepSessionRecord | AssistantMealRecord;

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
  activities(userId: string, period: { from: string; to: string }, activityTypes: string[], page: AssistantPageRequest): Promise<AssistantActivitySource[] | AssistantSourcePage<AssistantActivitySource>>;

  sleepSessions(userId: string, period: { from: string; to: string }): Promise<AssistantSleepSessionSource[]>;
  meals(userId: string, period: { from: string; to: string }): Promise<Meal[]>;

};

export type AssistantPageRequest = { limit: number; position: string | null; order: "asc" | "desc" };
export type AssistantSourcePage<T> = { items: T[]; hasMore: boolean; nextPosition: string | null; totalItems: number | null };

type CursorPayload = { version: 1; dataset: AssistantSemanticQuery["dataset"]; queryHash: string; position: string };

const MAX_PERIOD_DAYS = 3_660;
const STORAGE_PAGE_SIZE = 1_000;
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
      : query.dataset === "activities"
        ? query.activityTypes
        : query.dataset === "meals"
          ? query.mealTypes
          : [];
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

function shiftCivilDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function periodContains(period: { from: string; to: string }, date: string) {
  return date >= period.from && date <= period.to;
}

async function readHealthRecordBranch(userId: string, dataType: "exercise" | "sleep", period: { from: string; to: string }, branch: "civil_date" | "start_time" | "end_time") {
  const admin = createCloudflareAdminClient();
  const rows: HealthRecordRow[] = [];
  const lower = `${shiftCivilDate(period.from, -1)}T00:00:00.000Z`;
  const upper = `${shiftCivilDate(period.to, 2)}T00:00:00.000Z`;
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    let query = admin.from("health_records")
      .select("provider,source_device,source_record_id,civil_date,start_time,end_time,updated_at,payload")
      .eq("user_id", userId).eq("data_type", dataType)
      .order("civil_date", { ascending: false }).order("end_time", { ascending: false })
      .order("provider", { ascending: true }).order("source_record_id", { ascending: true });
    if (branch === "civil_date") query = query.gte("civil_date", period.from).lte("civil_date", period.to);
    else {
      query = query.is("civil_date", null).gte(branch, lower).lt(branch, upper);
      if (branch === "start_time" && dataType === "sleep") query = query.is("end_time", null);
    }
    const result = await query.range(offset, offset + STORAGE_PAGE_SIZE - 1);
    if (result.error) throw new Error(`Assistant ${dataType} data could not be loaded.`);
    const page = (result.data ?? []) as HealthRecordRow[];
    rows.push(...page);
    if (page.length < STORAGE_PAGE_SIZE) return rows;
  }
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeHealthRecord(row: HealthRecordRow): AssistantSleepSessionSource | null {
  const sourceRecordId = nullableString(row.source_record_id);
  if (!sourceRecordId) return null;
  return {
    provider: nullableString(row.provider),
    sourceDevice: nullableString(row.source_device),
    sourceRecordId,
    civilDate: nullableString(row.civil_date),
    startTime: nullableString(row.start_time),
    endTime: nullableString(row.end_time),
    updatedAt: nullableString(row.updated_at),
    payload: row.payload,
  };
}

async function readTargetedHealthRecords(userId: string, dataType: "exercise" | "sleep", period: { from: string; to: string }) {
  const branches: Array<"civil_date" | "start_time" | "end_time"> = dataType === "exercise"
    ? ["civil_date", "start_time"]
    : ["civil_date", "end_time", "start_time"];
  const pages = await Promise.all(branches.map((branch) => readHealthRecordBranch(userId, dataType, period, branch)));
  const byId = new Map<string, AssistantSleepSessionSource>();
  for (const rawRow of pages.flat()) {
    const row = normalizeHealthRecord(rawRow);
    if (!row) continue;
    const date = row.civilDate ?? (dataType === "exercise" ? row.startTime : row.endTime ?? row.startTime)?.slice(0, 10) ?? "";
    if (periodContains(period, date)) byId.set(`${row.provider ?? ""}\u0000${row.sourceRecordId}`, row);
  }
  return [...byId.values()].sort((first, second) => {
    const firstDate = first.civilDate ?? (dataType === "exercise" ? first.startTime : first.endTime ?? first.startTime)?.slice(0, 10) ?? "";
    const secondDate = second.civilDate ?? (dataType === "exercise" ? second.startTime : second.endTime ?? second.startTime)?.slice(0, 10) ?? "";
    return secondDate.localeCompare(firstDate) || String(second.endTime ?? "").localeCompare(String(first.endTime ?? ""));
  });
}

function activitySourceFromRow(row: Record<string, unknown>): AssistantActivitySource {
  const activity = exerciseSummaryFromRecord(row as Parameters<typeof exerciseSummaryFromRecord>[0]);
  const exercise = findObject(row.payload, "exercise") ?? {};
  const metricsSummary = isObject(exercise.metricsSummary) ? exercise.metricsSummary : {};
  const sourcePace = nestedNumber(metricsSummary, ["averagePaceSecondsPerMeter"]);
  return {
    activity,
    provider: nullableString(row.provider),
    startTime: nullableString(row.start_time),
    endTime: nullableString(row.end_time),
    importedAt: nullableString(row.updated_at),
    paceSource: sourcePace === null ? "soma_calculation" : "health_source",
  };
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
    const lowerTime = `${shiftCivilDate(period.from, -1)}T00:00:00.000Z`;
    const endExclusive = `${shiftCivilDate(period.to, 2)}T00:00:00.000Z`;
    const queryDate = async (field: "civil_date" | "start_time", offset: number) => {
      let query = admin.from("health_records").select("provider,source_record_id,civil_date,start_time,end_time,updated_at,payload")
        .eq("user_id", userId).eq("data_type", "exercise");
      if (field === "civil_date") query = query.gte("civil_date", period.from).lte("civil_date", period.to);
      else query = query.is("civil_date", null).gte("start_time", lowerTime).lt("start_time", endExclusive);
      if (nativeTypes.length) query = query.in("payload.exercise.exerciseType", nativeTypes);
      let ordered = query.order(field, { ascending: pageRequest.order === "asc" });
      if (field !== "start_time") ordered = ordered.order("start_time", { ascending: pageRequest.order === "asc" });
      const result = await ordered.order("source_record_id", { ascending: pageRequest.order === "asc" }).order("provider", { ascending: pageRequest.order === "asc" })
        .range(offset, offset + pageRequest.limit);
      if (result.error) throw new Error("Exercise history could not be loaded.");
      const rows = (result.data ?? []) as Array<Record<string, unknown>>;
      return {
        items: rows.slice(0, pageRequest.limit).map((row) => ({
          item: activitySourceFromRow(row),
          startTime: typeof row.start_time === "string" ? row.start_time : null,
        })),
        hasMore: rows.length > pageRequest.limit,
      };
    };
    const [civilDate, startTime] = await Promise.all([
      queryDate("civil_date", offsets.civilDate), queryDate("start_time", offsets.startTime),
    ]);
    // Consume only prefixes of each storage stream. Re-sorting a fetched window
    // would invalidate offsets, especially for null times and collated record IDs.
    const consumed = { civilDate: 0, startTime: 0 };
    const selected: AssistantActivitySource[] = [];
    const direction = pageRequest.order === "asc" ? 1 : -1;
    const compare = (left: (typeof civilDate.items)[number], right: (typeof startTime.items)[number]) => {
      const date = left.item.activity.date < right.item.activity.date ? -1 : left.item.activity.date > right.item.activity.date ? 1 : 0;
      if (date) return date * direction;
      // Match storage null ordering; use the stored time, not a payload fallback.
      const time = left.startTime === right.startTime ? 0 : left.startTime === null ? 1
        : right.startTime === null ? -1 : left.startTime < right.startTime ? -1 : 1;
      return time * direction;
    };
    while (selected.length < pageRequest.limit) {
      const left = civilDate.items[consumed.civilDate];
      const right = startTime.items[consumed.startTime];
      if (!left && !right) break;
      // Equal keys use a fixed stream preference; preserve storage's ID order
      // within each stream instead of comparing IDs with a different collation.
      const source = left && (!right || compare(left, right) <= 0) ? "civilDate" : "startTime";
      const entry = source === "civilDate" ? left : right;
      consumed[source] += 1;
      if (entry && periodContains(period, entry.item.activity.date) && assistantActivityTypeMatches(entry.item.activity.type, activityTypes)) selected.push(entry.item);
    }
    const hasMore = consumed.civilDate < civilDate.items.length || consumed.startTime < startTime.items.length
      || civilDate.hasMore || startTime.hasMore;
    const nextPosition = hasMore ? JSON.stringify({
      civilDate: offsets.civilDate + consumed.civilDate,
      startTime: offsets.startTime + consumed.startTime,
    }) : null;
    return { items: selected, hasMore, nextPosition, totalItems: null };
  },
  async sleepSessions(userId, period) {
    return await readTargetedHealthRecords(userId, "sleep", period);
  },
  async meals(userId, period) {
    return await listMeals(userId, { from: period.from, to: period.to, preferLatestCompletedAnalysis: true });

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

function projectMealRange(value: unknown): AssistantMealRange {
  if (!isObject(value)) return null;
  return { low: finiteNumber(value.low), likely: finiteNumber(value.likely), high: finiteNumber(value.high) };
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
          provenance: { source: metadata?.source ?? "health_source", provider, algorithmVersion: metadata?.source === "soma_calculation" ? "daily-health-metrics" : null },

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

function sourceObservation(input: {
  metric: string; value: number | null; unit: string | null; source: AssistantObservation["provenance"]["source"];
  provider: string | null; algorithmVersion?: string | null; measuredAt: string | null; importedAt: string | null;
}) {
  const value = finiteNumber(input.value);
  const coverage = value === null ? 0 : 1;
  const freshness = input.source === "confirmed_meals"
    ? value === null ? "missing" as const : "current" as const
    : calculateSignalFreshness({ measuredAt: input.measuredAt, importedAt: input.importedAt, coverage }).state;
  return {
    metric: input.metric,
    value,
    unit: input.unit,
    availability: value === null ? "missing" as const : "observed" as const,
    coverage,
    measuredAt: input.measuredAt,
    importedAt: input.importedAt,
    freshness,
    provenance: { source: input.source, provider: input.provider, algorithmVersion: input.algorithmVersion ?? null },
  };
}

const activityMetricDefinitions = [
  ["duration_minutes", "durationMinutes", "min"], ["active_minutes", "activeMinutes", "min"], ["calories_kcal", "calories", "kcal"],
  ["distance_km", "distanceKm", "km"], ["average_heart_rate", "averageHeartRate", "bpm"], ["maximum_heart_rate", "maximumHeartRate", "bpm"],
  ["zone_minutes", "zoneMinutes", "min"], ["average_speed_kph", "averageSpeedKph", "km/h"],
  ["average_pace_seconds_per_km", "averagePaceSecondsPerKm", "s/km"], ["elevation_gain_meters", "elevationGainMeters", "m"],
  ["steps", "steps", "steps"], ["run_vo2_max", "runVo2Max", "ml/kg/min"], ["swim_lengths", "swimLengths", "lengths"],
  ["cadence", "cadence", "steps/min"], ["stride_length_meters", "strideLengthMeters", "m"],
  ["ground_contact_milliseconds", "groundContactMilliseconds", "ms"], ["vertical_oscillation_millimeters", "verticalOscillationMillimeters", "mm"],
  ["vertical_ratio", "verticalRatio", "%"],
] as const;

function activityRecords(rows: AssistantActivitySource[], query: Extract<AssistantSemanticQuery, { dataset: "activities" }>): AssistantActivityRecord[] {
  return rows.filter(({ activity }) => periodContains(query.period, activity.date))
    .filter(({ activity }) => assistantActivityTypeMatches(activity.type, query.activityTypes))
    .map((source) => {
      const measuredAt = source.endTime ?? source.startTime;
      const duration = finiteNumber(source.activity.durationMinutes);
      const qualityFlags: AssistantActivityRecord["qualityFlags"] = [];
      if (duration !== null && duration >= 0) {
        if (source.activity.zoneMinutes !== null && source.activity.zoneMinutes > duration + 1) qualityFlags.push("zone_minutes_exceed_duration");
        if (source.activity.activeMinutes !== null && source.activity.activeMinutes > duration + 1) qualityFlags.push("active_minutes_exceed_duration");
      }
      return {
        type: "activity" as const,
        date: source.activity.date,
        activity: source.activity,
        startTime: source.startTime,
        endTime: source.endTime,
        qualityFlags,
        observations: activityMetricDefinitions.map(([metric, key, unit]) => sourceObservation({
          metric,
          value: source.activity[key] as number | null,
          unit,
          source: metric === "duration_minutes" || (metric === "average_pace_seconds_per_km" && source.paceSource === "soma_calculation")
            ? "soma_calculation"
            : "health_source",
          provider: source.provider,
          algorithmVersion: metric === "duration_minutes"
            ? "session-times-v1"
            : metric === "average_pace_seconds_per_km" && source.paceSource === "soma_calculation"
              ? "activity-derived-pace-v1"
              : null,
          measuredAt,
          importedAt: source.importedAt,
        })),
      };
    });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findObject(value: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findObject(item, key); if (found) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  if (isObject(value[key])) return value[key] as Record<string, unknown>;
  for (const child of Object.values(value)) { const found = findObject(child, key); if (found) return found; }
  return null;
}

function nestedNumber(value: unknown, keys: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = nestedNumber(item, keys); if (found !== null) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  for (const key of keys) {
    const parsed = Number(value[key]);
    if (value[key] !== null && value[key] !== undefined && Number.isFinite(parsed)) return parsed;
  }
  for (const child of Object.values(value)) { const found = nestedNumber(child, keys); if (found !== null) return found; }
  return null;
}

function durationMinutes(value: unknown) {
  if (typeof value !== "string") return null;
  const seconds = Number(value.replace(/s$/u, ""));
  return Number.isFinite(seconds) ? seconds / 60 : null;
}

function sleepSessionRecords(rows: AssistantSleepSessionSource[], query: Extract<AssistantSemanticQuery, { dataset: "sleep_sessions" }>, importedAt: string | null): AssistantSleepSessionRecord[] {
  return rows.flatMap((row) => {
    const date = row.civilDate ?? (row.endTime ?? row.startTime)?.slice(0, 10) ?? "";
    if (!periodContains(query.period, date)) return [];
    const sleep = findObject(row.payload, "sleep") ?? {};
    const summary = isObject(sleep.summary) ? sleep.summary : {};
    const stageValues = Array.isArray(sleep.stages) ? sleep.stages : [];
    const stages = stageValues.flatMap((stage) => {
      if (!isObject(stage)) return [];
      const type = typeof stage.type === "string" ? stage.type.toUpperCase() : "UNKNOWN";
      return [{
        type,
        startTime: typeof stage.startTime === "string" ? stage.startTime : null,
        endTime: typeof stage.endTime === "string" ? stage.endTime : null,
        durationMinutes: durationMinutes(stage.duration) ?? (typeof stage.durationMinutes === "number" && Number.isFinite(stage.durationMinutes) ? stage.durationMinutes : null),
      }];
    });
    const summaryStages = Array.isArray(summary.stagesSummary) ? summary.stagesSummary : [];
    const stagesSummary = summaryStages.flatMap((stage) => isObject(stage) ? [{
      type: typeof stage.type === "string" ? stage.type.toUpperCase() : "UNKNOWN",
      minutes: finiteNumber(stage.minutes),
      count: finiteNumber(stage.count),
    }] : []);
    const sleepMinutes = nestedNumber(summary, ["minutesAsleep"]);
    const inBedMinutes = nestedNumber(summary, ["minutesInSleepPeriod", "timeInBedMinutes"]);
    const awakeMinutes = nestedNumber(summary, ["minutesAwake"]);
    const latencyMinutes = nestedNumber(summary, ["minutesToFallAsleep"]);
    const measuredAt = row.endTime ?? row.startTime;
    const recordImportedAt = row.updatedAt ?? importedAt;
    const sourceMetrics = [
      sourceObservation({ metric: "sleep_minutes", value: sleepMinutes, unit: "min", source: "health_source", provider: row.provider, measuredAt, importedAt: recordImportedAt }),
      sourceObservation({ metric: "sleep_in_bed_minutes", value: inBedMinutes, unit: "min", source: "health_source", provider: row.provider, measuredAt, importedAt: recordImportedAt }),
      sourceObservation({ metric: "sleep_awake_minutes", value: awakeMinutes, unit: "min", source: "health_source", provider: row.provider, measuredAt, importedAt: recordImportedAt }),
      sourceObservation({ metric: "sleep_latency_minutes", value: latencyMinutes, unit: "min", source: "health_source", provider: row.provider, measuredAt, importedAt: recordImportedAt }),
    ];
    const duration = row.startTime && row.endTime ? (Date.parse(row.endTime) - Date.parse(row.startTime)) / 60_000 : null;
    return [{
      type: "sleep_session" as const,
      date,
      session: {
        id: row.sourceRecordId,
        startTime: row.startTime,
        endTime: row.endTime,
        durationMinutes: duration !== null && Number.isFinite(duration) && duration >= 0 ? duration : null,
        sleepMinutes,
        minutesInSleepPeriod: inBedMinutes,
        minutesAwake: awakeMinutes,
        minutesToFallAsleep: latencyMinutes,
        stages,
        stagesSummary,
        sourceDevice: row.sourceDevice,
        provider: row.provider,
        importedAt: recordImportedAt,
      },
      observations: sourceMetrics,
    }];
  });
}

const mealMetricDefinitions = [
  ["calories_kcal", "calories", "kcal"], ["protein_g", "proteinGrams", "g"], ["carbs_g", "carbohydrateGrams", "g"],
  ["fat_g", "fatGrams", "g"], ["fiber_g", "fiberGrams", "g"], ["sugar_g", "sugarGrams", "g"], ["added_sugar_g", "addedSugarGrams", "g"],
] as const;

function mealRecords(rows: Meal[], query: Extract<AssistantSemanticQuery, { dataset: "meals" }>): AssistantMealRecord[] {
  const mealTypes = new Set(query.mealTypes);
  return rows.filter((meal) => periodContains(query.period, meal.mealDate))
    .filter((meal) => !mealTypes.size || mealTypes.has(meal.mealType))
    .map((meal) => {
      const entryState = meal.entryState ?? "recorded";
      const nutritionEligible = meal.status === "confirmed" && entryState !== "skipped";
      const nutritionExclusionReason = entryState === "skipped" ? "explicitly_skipped" as const : meal.status !== "confirmed" ? "draft" as const : null;
      const analysis = nutritionEligible && meal.analysis?.status === "completed" && meal.analysis.result
        ? meal.analysis
        : nutritionEligible && meal.lastSuccessfulAnalysis?.status === "completed" && meal.lastSuccessfulAnalysis.result
          ? meal.lastSuccessfulAnalysis
          : null;
      const result = analysis?.result ?? null;
      const totals: AssistantMealTotals = {
        calories: projectMealRange(result?.totals.calories),
        proteinGrams: projectMealRange(result?.totals.proteinGrams),
        carbohydrateGrams: projectMealRange(result?.totals.carbohydrateGrams),
        fatGrams: projectMealRange(result?.totals.fatGrams),
        fiberGrams: projectMealRange(result?.totals.fiberGrams),
        sugarGrams: projectMealRange(result?.totals.sugarGrams),
        addedSugarGrams: projectMealRange(result?.totals.addedSugarGrams),
      };
      const provider = analysis?.provider ?? null;
      const model = analysis?.model ?? null;
      const coreFields = [totals.calories, totals.proteinGrams, totals.carbohydrateGrams, totals.fatGrams, totals.fiberGrams];
      const coverage = coreFields.filter((range) => range !== null && range !== undefined).length / coreFields.length;
      const observations = nutritionEligible ? mealMetricDefinitions.map(([metric, key, unit]) => {
        const range = totals[key];
        return sourceObservation({
          metric,
          value: range ? range.likely : null,
          unit,
          source: "confirmed_meals",
          provider,
          algorithmVersion: model,
          measuredAt: null,
          importedAt: meal.createdAt,
        });
      }) : mealMetricDefinitions.map(([metric]) => ({
        metric, value: null, unit: null, availability: "not_calculable" as const, coverage: 0,
        measuredAt: null, importedAt: meal.createdAt, freshness: "missing" as const,
        provenance: { source: "confirmed_meals" as const, provider: null, algorithmVersion: null },
      }));
      return {
        type: "meal" as const,
        date: meal.mealDate,
        meal: {
          id: meal.id,
          mealType: meal.mealType,
          status: meal.status,
          entryState,
          nutritionEligible,
          nutritionExclusionReason,
          note: meal.note,
          origin: meal.photos.length ? (new Set(meal.photos.map((photo) => photo.origin)).size > 1 ? "mixed" : meal.photos[0].origin) : "unknown",
          recordedAt: meal.createdAt,
          analysis: result ? {
            status: analysis?.status ?? "missing",
            provider,
            model,
            confidence: result.confidence,
            coverage,
            totals,
            foods: result.foods.map((food) => ({
              id: food.id ?? null, name: food.name, preparation: food.preparation, portion: food.portion,
              estimatedGrams: food.estimatedGrams, quantity: food.quantity ?? null, kind: food.kind ?? null,
              parentId: food.parentId ?? null, course: food.course ?? null, countedInTotals: food.countedInTotals ?? null,
              calories: projectMealRange(food.calories), proteinGrams: projectMealRange(food.proteinGrams), carbohydrateGrams: projectMealRange(food.carbohydrateGrams),
              fatGrams: projectMealRange(food.fatGrams), fiberGrams: projectMealRange(food.fiberGrams), sugarGrams: projectMealRange(food.sugarGrams),
              addedSugarGrams: projectMealRange(food.addedSugarGrams), confidence: food.confidence,
            })),
          } : null,
          provenance: { source: "confirmed_meals" as const, provider, algorithmVersion: model },
        },
        observations,
      };
    });
}

function recordPosition(record: AssistantSemanticRecord) {
  if (record.type === "score") return `${record.date}|${record.kind}`;
  if (record.type === "activity") {
    const timestamp = record.endTime ?? record.startTime;
    const source = record.observations[0]?.provenance.provider ?? "";
    return `${record.date}|${normalizeTimestamp(timestamp)}|${source}|${record.activity.id}`;
  }
  if (record.type === "sleep_session") return `${record.date}|${normalizeTimestamp(record.session.endTime ?? record.session.startTime)}|${record.session.provider ?? ""}|${record.session.id}`;
  if (record.type === "meal") return `${record.date}|${normalizeTimestamp(record.meal.recordedAt)}|${record.meal.id}`;
  return record.date;
}

function normalizeTimestamp(value: string | null) {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;

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
  const profilePromise = sources.profile(userId);
  let profile: Awaited<ReturnType<AssistantDataSources["profile"]>>;
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
    const [profileContext, sourceResult] = await Promise.all([profilePromise, sources.health(userId, query.period, query.metrics, pageRequest)]);
    profile = profileContext;
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
    const [profileContext, sourceResult] = await Promise.all([profilePromise, sources.scores(userId, query.period, query.kinds, pageRequest)]);
    profile = profileContext;
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
    const [profileContext, sourceRows] = await Promise.all([profilePromise, sources.nutrition(userId, query.period)]);
    profile = profileContext;
    records = nutritionRecords(sourceRows, query);
    const legacy = paginate(records, query, userId, options.cursorSecret);
    paginated = { ...legacy, totalKnown: true };
  } else if (query.dataset === "activities") {
    const [profileContext, sourceResult] = await Promise.all([profilePromise, sources.activities(userId, query.period, query.activityTypes, pageRequest)]);
    profile = profileContext;
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
  } else {
    if (query.dataset === "sleep_sessions") {
      const [profileContext, sourceRows] = await Promise.all([profilePromise, sources.sleepSessions(userId, query.period)]);
      profile = profileContext;
      records = sleepSessionRecords(sourceRows, query, profile.importedAt);
    } else {
      const [profileContext, sourceRows] = await Promise.all([profilePromise, sources.meals(userId, query.period)]);
      profile = profileContext;
      records = mealRecords(sourceRows, query);
    }
    paginated = { ...paginate(records, query, userId, options.cursorSecret), totalKnown: true };
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
