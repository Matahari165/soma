import { assistantQueryManifestSchema, type AssistantMessagePart } from "./contracts";

type ToolResult = { toolName: string; input: unknown; output: unknown };
type Step = { toolResults: ReadonlyArray<ToolResult> };
type Domain = Extract<AssistantMessagePart, { type: "data-summary" }>["domains"][number];

function domainsFor(dataset: string, input: unknown): Domain[] {
  if (dataset === "nutrition_daily" || dataset === "meals") return ["nutrition"];
  if (dataset === "activities") return ["effort"];
  if (dataset === "sleep_sessions") return ["sleep"];
  if (!input || typeof input !== "object") return [];
  const value = input as Record<string, unknown>;
  if (dataset === "scores") {
    return Array.isArray(value.kinds)
      ? value.kinds.filter((kind): kind is Domain => kind === "sleep" || kind === "recovery" || kind === "effort")
      : [];
  }
  if (dataset !== "daily_health" || !Array.isArray(value.metrics)) return [];
  const domains = new Set<Domain>();
  for (const metric of value.metrics) {
    if (typeof metric !== "string") continue;
    if (metric.startsWith("sleep_") || metric.includes("sleep_debt")) domains.add("sleep");
    else if (["hrv_ms", "resting_heart_rate", "respiratory_rate", "oxygen_saturation", "skin_temperature_delta"].includes(metric)) domains.add("recovery");
    else if (/^(?:steps|active_|zone_|exercise_|distance_|running_|weekly_load|acute_chronic_load_ratio|vo2_max)/u.test(metric)) domains.add("effort");
  }
  return [...domains];
}

export function dataSummaryFromSteps(steps: ReadonlyArray<Step> | undefined): Extract<AssistantMessagePart, { type: "data-summary" }> | null {
  const results = (steps ?? []).flatMap((step) => step.toolResults);
  const toolStats = analysisStats(results);
  const completedJobs = new Map<string, ToolResult>();
  for (const result of results) if (result.toolName === "summarizeSomaData") {
    const output = result.output as { jobId?: unknown } | null;
    if (typeof output?.jobId === "string") completedJobs.set(output.jobId, result);
  }
  const summaries = [...completedJobs.values()].flatMap((result): ToolResult[] => {
    const output = result.output as { manifest?: Record<string, unknown> };
    const manifest = output.manifest;
    const input = result.input as { query?: Record<string, unknown> };
    if (!manifest || typeof manifest.processedItems !== "number" || typeof manifest.complete !== "boolean") return [];
    // A checkpoint covers all preceding pages; count the latest checkpoint once.
    return [{ ...result, input: input.query ?? {}, output: { manifest: {
      ...manifest, timezone: "UTC", returnedItems: manifest.processedItems,
      totalItems: typeof manifest.totalItems === "number" ? manifest.totalItems : null,
      totalKnown: typeof manifest.totalItems === "number",
      nextCursor: manifest.complete ? null : "summary-checkpoint",
    } } }];
  });
  function identity(input: unknown) {
    const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return JSON.stringify({ dataset: value.dataset, period: value.period, metrics: value.metrics, kinds: value.kinds, activityTypes: value.activityTypes });
  }
  const summaryByQuery = new Map(summaries.map((result) => [identity(result.input), result]));
  const queries = [...results.filter((result) => result.toolName === "querySomaData" && !summaryByQuery.has(identity(result.input))), ...summaryByQuery.values()];
  if (!queries.length && !toolStats.length) return null;
  const domains = new Set<Domain>();
  const latestByQuery = new Map<string, boolean>();
  const seenPages = new Set<string>();
  const periods: Array<{ from: string; to: string }> = [];
  const coveredPeriods: Array<{ from: string; to: string }> = [];
  let itemCount = 0;
  for (const query of queries) {
    const output = query.output && typeof query.output === "object" ? query.output as Record<string, unknown> : null;
    const parsed = assistantQueryManifestSchema.safeParse(output?.manifest);
    if (!parsed.success) continue;
    const manifest = parsed.data;
    periods.push(manifest.requestedPeriod);
    if (manifest.coveredPeriod) coveredPeriods.push(manifest.coveredPeriod);
    for (const domain of domainsFor(manifest.dataset, query.input)) domains.add(domain);
    const input = query.input && typeof query.input === "object" ? query.input as Record<string, unknown> : {};
    const queryWithoutPagination = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "pagination"));
    const queryKey = JSON.stringify(queryWithoutPagination);
    const pagination = input.pagination && typeof input.pagination === "object" ? input.pagination as Record<string, unknown> : {};
    const pageKey = JSON.stringify([queryKey, pagination.cursor ?? null]);
    if (!seenPages.has(pageKey)) {
      itemCount += manifest.returnedItems;
      seenPages.add(pageKey);
    }
    latestByQuery.set(queryKey, manifest.complete);
  }
  if (!periods.length) return toolStats.length ? {
    type: "data-summary", label: toolStats.every((stat) => stat.complete) ? "Analyses Soma consultées" : "Analyses Soma consultées · analyse partielle",
    period: null, coveredPeriod: null, itemCount: 0, domains: [], toolStats,
  } : null;
  const from = periods.map((period) => period.from).sort()[0];
  const to = periods.map((period) => period.to).sort().at(-1)!;
  const coveredPeriod = coveredPeriods.length ? {
    from: coveredPeriods.map((period) => period.from).sort()[0],
    to: coveredPeriods.map((period) => period.to).sort().at(-1)!,
  } : null;
  const complete = [...latestByQuery.values()].every(Boolean) && toolStats.every((stat) => stat.complete);
  return {
    type: "data-summary",
    label: complete ? "Données Soma consultées" : "Données Soma consultées · analyse partielle",
    period: { from, to },
    coveredPeriod,
    itemCount,
    domains: [...domains],
    ...(toolStats.length ? { toolStats } : {}),
  };
}

/** Counts the bounded pages returned by analysis tools, never the underlying health samples. */
function analysisStats(results: ReadonlyArray<ToolResult>) {
  const stats = new Map<string, { toolName: "queryLabAnalyses" | "getStrongestEffects"; itemCount: number; complete: boolean; periods: Array<"15" | "30" | "90" | "all"> }>();
  const pages = new Set<string>();
  const ranges = new Map<string, Map<number, { length: number; last: boolean }>>();
  for (const result of results) {
    if (result.toolName !== "queryLabAnalyses" && result.toolName !== "getStrongestEffects") continue;
    if (!result.output || typeof result.output !== "object") continue;
    const output = result.output as Record<string, unknown>;
    const input = result.input && typeof result.input === "object" ? result.input as Record<string, unknown> : {};
    const items = Array.isArray(output.relations) ? output.relations : Array.isArray(output.comparisons) ? output.comparisons : null;
    if (!items) continue;
    const key = JSON.stringify([result.toolName, Object.fromEntries(Object.entries(input).filter(([name]) => name !== "offset" && name !== "limit"))]);
    if (!stats.has(key) && stats.size >= 8) continue;
    const pagination = output.pagination && typeof output.pagination === "object" ? output.pagination as Record<string, unknown> : null;
    // A malformed paginated result cannot establish complete coverage.
    const complete = result.toolName === "getStrongestEffects" || pagination?.hasMore === false;
    const requestedPeriods = Array.isArray(output.periods) ? output.periods : [output.period];
    const periods = [...new Set(requestedPeriods.filter((period): period is 15 | 30 | 90 | "all" => period === 15 || period === 30 || period === 90 || period === "all"))].slice(0, 4).map((period) => String(period) as "15" | "30" | "90" | "all");
    const stat = stats.get(key) ?? { toolName: result.toolName, itemCount: 0, complete: false, periods };
    const pageKey = JSON.stringify([key, input.offset ?? 0]);
    if (!pages.has(pageKey)) { stat.itemCount += Math.min(items.length, 100); pages.add(pageKey); }
    if (result.toolName === "getStrongestEffects") stat.complete = complete;
    else {
      const queryRanges = ranges.get(key) ?? new Map<number, { length: number; last: boolean }>();
      const offset = typeof input.offset === "number" && Number.isInteger(input.offset) && input.offset >= 0 ? input.offset : 0;
      queryRanges.set(offset, { length: Math.min(items.length, 100), last: complete });
      ranges.set(key, queryRanges);
      let through = 0;
      let reachedLast = false;
      for (const [start, page] of [...queryRanges.entries()].sort(([left], [right]) => left - right)) {
        if (start > through) break;
        through = Math.max(through, start + page.length);
        reachedLast ||= page.last;
      }
      stat.complete = reachedLast;
    }
    stats.set(key, stat);
  }
  return [...stats.values()];
}
