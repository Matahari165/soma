import "server-only";

import { abortable } from "@/lib/abortable";
import { z } from "zod";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { assistantSemanticQuerySchema, type AssistantSemanticQuery } from "../contracts";
import { queryAssistantData, type AssistantSemanticResult } from "./semantic-query";
import { queryFingerprint } from "./scoped-cursor";
import { loadAssistantActivityTelemetry, AssistantActivityTelemetryUnavailableError } from "./activity-telemetry";

export const assistantDataSummarySchema = z.object({
  query: assistantSemanticQuerySchema,
  jobId: z.uuid().optional(),
  includeHeartRateZones: z.boolean().default(false),
}).strict();

type Statistic = {
  count: number; missing: number; partial: number; sum: number; min: number | null; max: number | null;
  first: { date: string; value: number } | null; last: { date: string; value: number } | null;
  sumX: number; sumXX: number; sumXY: number; unit: string | null; sources: string[]; nonNumeric: Record<string, number>;
};
export type AssistantDataSummaryJob = {
  id: string; user_id: string; query_hash: string; query: AssistantSemanticQuery;
  telemetry_progress?: { activityId: string; nextPageToken: string | null; complete: boolean } | null;
  cursor: string | null; status: "running" | "completed"; processed: number; total: number | null;
  covered_from: string | null; covered_to: string | null; statistics: Record<string, Statistic>;
  activity_types: Record<string, number>; include_zones: boolean; zones: { sessions: number; partial: number; unavailable: number; seconds: Record<string, number>; observedSeconds: number; activeSeconds: number; belowZoneSeconds: number; aboveMaximumSeconds: number; references: Record<string, number> }; created_at: string; updated_at: string;
};
class SummaryCheckpointConflict extends Error {}

type JobStore = { load(userId: string, id: string): Promise<AssistantDataSummaryJob | null>; findPending?(userId: string, hash: string): Promise<AssistantDataSummaryJob | null>; save(job: AssistantDataSummaryJob, previousVersion?: string): Promise<boolean> };

const defaultStore: JobStore = {
  async findPending(userId, hash) {
    const result = await createCloudflareAdminClient().from("assistant_data_jobs").select("*")
      .eq("user_id", userId).eq("query_hash", hash).eq("status", "running")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw new Error("Assistant summary checkpoint could not be found.");
    return result.data as AssistantDataSummaryJob | null;
  },
  async load(userId, id) {
    const result = await createCloudflareAdminClient().from("assistant_data_jobs").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (result.error) throw new Error("Assistant summary job could not be loaded.");
    return result.data as AssistantDataSummaryJob | null;
  },
  async save(job, previousVersion) {
    const admin = createCloudflareAdminClient();
    if (!previousVersion) {
      const result = await admin.from("assistant_data_jobs").insert(job);
      if (result.error) throw new Error("Assistant summary job could not be saved.");
      return true;
    }
    const result = await admin.from("assistant_data_jobs").update(job).eq("user_id", job.user_id).eq("id", job.id)
      .eq("updated_at", previousVersion).select("id,updated_at");
    if (result.error) throw new Error("Assistant summary checkpoint could not be saved.");
    const persisted = result.data?.[0];
    // The storage adapter may stamp its own update time; use the persisted CAS version.
    if (persisted && typeof persisted.updated_at === "string") job.updated_at = persisted.updated_at;
    return Boolean(persisted);
  },
};

function observe(job: AssistantDataSummaryJob, key: string, value: unknown, date: string, unit: string | null, source: string, partial = false) {
  const stat = job.statistics[key] ??= { count: 0, missing: 0, partial: 0, sum: 0, min: null, max: null,
    first: null, last: null, sumX: 0, sumXX: 0, sumXY: 0, unit, sources: [], nonNumeric: {} };
  if (!stat.sources.includes(source)) stat.sources.push(source);
  // Clocks and booleans have their own type. No numeric average is invented for these values.
  if (typeof value === "string" || typeof value === "boolean") {
    const key = String(value); stat.nonNumeric[key] = (stat.nonNumeric[key] ?? 0) + 1; return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) { stat.missing += 1; return; }
  stat.count += 1;
  stat.partial += Number(partial);
  stat.sum += value;
  stat.min = stat.min === null ? value : Math.min(stat.min, value);
  stat.max = stat.max === null ? value : Math.max(stat.max, value);
  if (!stat.first || date < stat.first.date) stat.first = { date, value };
  if (!stat.last || date > stat.last.date) stat.last = { date, value };
  const x = Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  stat.sumX += x; stat.sumXX += x * x; stat.sumXY += x * value;
}

function accumulate(job: AssistantDataSummaryJob, result: AssistantSemanticResult) {
  for (const item of result.items) {
    job.processed += 1;
    job.covered_from = job.covered_from === null || item.date < job.covered_from ? item.date : job.covered_from;
    job.covered_to = job.covered_to === null || item.date > job.covered_to ? item.date : job.covered_to;
    if (item.type === "daily") for (const observation of item.observations) {
      observe(job, observation.metric, observation.value, item.date, observation.unit, observation.provenance.source, observation.availability === "partial");
    }
    else if (item.type === "score") {
      observe(job, item.kind, item.observation.value, item.date, item.observation.unit, "soma_calculation");
    }
    else {
      job.activity_types[item.activity.type] = (job.activity_types[item.activity.type] ?? 0) + 1;
      const fields = { durationMinutes: "min", activeMinutes: "min", calories: "kcal", distanceKm: "km", averageHeartRate: "bpm", maximumHeartRate: "bpm", zoneMinutes: "min", averagePaceSecondsPerKm: "s/km", elevationGainMeters: "m", steps: "steps" };
      for (const [field, unit] of Object.entries(fields)) observe(job, field, item.activity[field as keyof typeof item.activity], item.date, unit, "health_source");
    }
  }
  job.total = result.manifest.hasMore ? result.manifest.totalItems : job.processed;
  job.cursor = result.manifest.nextCursor;
  job.status = result.manifest.hasMore ? "running" : "completed";
}

function publicResult(job: AssistantDataSummaryJob, pauseReason?: "time_budget" | "source_unavailable") {
  const statistics = Object.fromEntries(Object.entries(job.statistics).map(([key, stat]) => {
    const denominator = stat.count * stat.sumXX - stat.sumX * stat.sumX;
    return [key, { observations: stat.count, missing: stat.missing, partial: stat.partial,
      unit: stat.unit, mean: stat.count ? stat.sum / stat.count : null,
      sum: stat.count ? stat.sum : null, min: stat.min, max: stat.max, first: stat.first, last: stat.last,
      linearTrendPerDay: stat.count > 1 && denominator > 0 ? (stat.count * stat.sumXY - stat.sumX * stat.sum) / denominator : null,
      sources: stat.sources, nonNumericValues: Object.fromEntries(Object.entries(stat.nonNumeric).sort((a, b) => b[1] - a[1]).slice(0, 20)),
      nonNumericValueCount: Object.values(stat.nonNumeric).reduce((sum, count) => sum + count, 0),
      nonNumericValuesComplete: Object.keys(stat.nonNumeric).length <= 20 }];
  }));
  return {
    jobId: job.id, status: job.status, ...(pauseReason ? { pauseReason } : {}), statistics, activityTypes: job.activity_types,
    heartRateZones: job.include_zones ? { ...job.zones, method: "percent_max_heart_rate", source: "soma_calculation", coveragePercent: job.zones.activeSeconds ? Math.min(100, 100 * job.zones.observedSeconds / job.zones.activeSeconds) : null } : null,
    manifest: { dataset: job.query.dataset, requestedPeriod: job.query.period,
      coveredPeriod: job.covered_from && job.covered_to ? { from: job.covered_from, to: job.covered_to } : null,
      processedItems: job.processed, totalItems: job.total, totalKnown: job.total !== null, complete: job.status === "completed",
      hasMore: job.status !== "completed", generatedAt: job.updated_at },
    note: "Les statistiques portent sur les observations reçues, pas sur les jours absents. Une somme n'est pas une charge physiologique. La pente descriptive n'est ni un score Soma ni une relation causale. Si status=running, reprendre le même jobId : les résultats sont partiels.",
  };
}

export async function summarizeAssistantData(userId: string, input: unknown, options: {
  store?: JobStore; queryPage?: typeof queryAssistantData; maxPages?: number; now?: () => number; telemetry?: typeof loadAssistantActivityTelemetry; budgetMs?: number;
} = {}) {
  if (!userId) throw new Error("Authenticated user is required.");
  const parsed = assistantDataSummarySchema.parse(input);
  if (parsed.includeHeartRateZones && parsed.query.dataset !== "activities") throw new Error("Heart-rate zones require an activities query.");
  const query = assistantSemanticQuerySchema.parse({ ...parsed.query, pagination: { limit: parsed.includeHeartRateZones ? 1 : 200, cursor: null, order: "asc" } });
  const now = options.now ?? Date.now;
  const started = now();
  const budgetMs = Math.max(1, Math.min(20_000, options.budgetMs ?? 20_000));
  const signal = AbortSignal.timeout(budgetMs);
  const hash = queryFingerprint(userId, { query, includeHeartRateZones: parsed.includeHeartRateZones });
  const store = options.store ?? defaultStore;
  let job: AssistantDataSummaryJob;
  if (parsed.jobId) {
    const existing = await abortable(store.load(userId, parsed.jobId), signal);
    if (!existing || existing.user_id !== userId || existing.query_hash !== hash) throw new Error("Summary job does not belong to this user and query.");
    job = structuredClone(existing);
    if (job.status === "completed") return publicResult(job);
  } else {
    // Recover a checkpoint even when a connection died before the first jobId reached the model.
    const pending = await abortable(store.findPending?.(userId, hash) ?? Promise.resolve(null), signal);
    if (pending && pending.user_id === userId && pending.query_hash === hash) {
      job = structuredClone(pending);
    } else {
      const timestamp = new Date(now()).toISOString();
      job = { id: crypto.randomUUID(), user_id: userId, query_hash: hash, query, cursor: null, status: "running",
        processed: 0, total: null, covered_from: null, covered_to: null, statistics: {}, activity_types: {}, include_zones: parsed.includeHeartRateZones,
        zones: { sessions: 0, partial: 0, unavailable: 0, seconds: {}, observedSeconds: 0, activeSeconds: 0, belowZoneSeconds: 0, aboveMaximumSeconds: 0, references: {} }, created_at: timestamp, updated_at: timestamp };
      await abortable(store.save(job), signal);
    }
  }
  let durableJob = structuredClone(job);
  const pages = Math.max(1, Math.min(100, options.maxPages ?? 40));
  try {
    for (let page = 0; page < pages && now() - started < budgetMs; page += 1) {
      signal.throwIfAborted();
      const result = await abortable((options.queryPage ?? queryAssistantData)(userId, { ...query, pagination: { ...query.pagination, cursor: job.cursor } }), signal);
      if (result.manifest.hasMore && (!result.manifest.nextCursor || result.manifest.nextCursor === job.cursor)) throw new Error("Summary pagination made no progress.");
      if (job.include_zones) for (const item of result.items) {
        if (item.type !== "activity") continue;
        try {
          const progress = job.telemetry_progress?.activityId === item.activity.id ? job.telemetry_progress : null;
          const telemetry = await abortable((options.telemetry ?? loadAssistantActivityTelemetry)(userId, { activityId: item.activity.id }, undefined, {
            signal, heartRatePageToken: progress?.nextPageToken ?? undefined, skipHeartRateFetch: progress?.complete ?? false,
            onHeartRatePage: async (nextPageToken) => {
              signal.throwIfAborted();
              const previousVersion = job.updated_at;
              job.telemetry_progress = { activityId: item.activity.id, nextPageToken, complete: nextPageToken === null };
              job.updated_at = new Date(Math.max(now(), Date.parse(previousVersion) + 1)).toISOString();
              if (!await abortable(store.save(job, previousVersion), signal)) throw new SummaryCheckpointConflict("Summary checkpoint conflict.");
              durableJob = structuredClone(job);
            },
          }), signal);
          if (job.telemetry_progress?.activityId === item.activity.id && !job.telemetry_progress.complete) return publicResult(durableJob, "source_unavailable");
          const zones = telemetry.calculatedZones;
          job.zones.activeSeconds += telemetry.coverage.activeSeconds;
          job.zones.observedSeconds += telemetry.coverage.observedSeconds;
          if (!zones) { job.zones.unavailable += 1; continue; }
          job.zones.sessions += 1;
          job.zones.partial += Number(!zones.complete || (telemetry.coverage.percent ?? 0) < 99.999 || telemetry.heartRateFetchLimited);
          job.zones.belowZoneSeconds += zones.belowZoneSeconds;
          job.zones.aboveMaximumSeconds += zones.aboveMaximumSeconds;
          for (const [zone, seconds] of Object.entries(zones.seconds)) job.zones.seconds[zone] = (job.zones.seconds[zone] ?? 0) + seconds;
          const reference = `${zones.maximumHeartRate.source}:${zones.maximumHeartRate.bpm}`;
          job.zones.references[reference] = (job.zones.references[reference] ?? 0) + 1;
        } catch (error) {
          if (signal.aborted || error instanceof SummaryCheckpointConflict) throw error;
          // Transient source failures remain resumable even before the first fetched page.
          if (!(error instanceof AssistantActivityTelemetryUnavailableError)) return publicResult(durableJob, "source_unavailable");
          job.zones.unavailable += 1;
        }
      }
      signal.throwIfAborted();
      const previousVersion = job.updated_at;
      job.telemetry_progress = null;
      accumulate(job, result);
      job.updated_at = new Date(Math.max(now(), Date.parse(previousVersion) + 1)).toISOString();
      if (!await abortable(store.save(job, previousVersion), signal)) {
        const winner = await abortable(store.load(userId, job.id), signal);
        if (!winner || winner.user_id !== userId || winner.query_hash !== hash) throw new Error("Summary checkpoint conflict.");
        return publicResult(winner);
      }
      durableJob = structuredClone(job);
      if (job.status === "completed") break;
    }
  } catch (error) {
    if (signal.aborted) return publicResult(durableJob, "time_budget");
    if (error instanceof SummaryCheckpointConflict) {
      const winner = await abortable(store.load(userId, job.id), signal);
      if (!winner || winner.user_id !== userId || winner.query_hash !== hash) throw error;
      return publicResult(winner);
    }
    if (!signal.aborted) throw error;
    return publicResult(durableJob, "time_budget");
  }
  return publicResult(job);
}
