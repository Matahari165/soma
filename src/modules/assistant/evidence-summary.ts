import { assistantQueryManifestSchema, type AssistantMessagePart } from "./contracts";

type ToolResult = { toolName: string; input: unknown; output: unknown };
type Step = { toolResults: ReadonlyArray<ToolResult> };
type Domain = Extract<AssistantMessagePart, { type: "data-summary" }>["domains"][number];

function domainsFor(dataset: string, input: unknown): Domain[] {
  if (dataset === "nutrition_daily") return ["nutrition"];
  if (dataset === "activities") return ["effort"];
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
  if (!queries.length) return null;
  const domains = new Set<Domain>();
  const latestByQuery = new Map<string, boolean>();
  const seenPages = new Set<string>();
  const periods: Array<{ from: string; to: string }> = [];
  let itemCount = 0;
  for (const query of queries) {
    const output = query.output && typeof query.output === "object" ? query.output as Record<string, unknown> : null;
    const parsed = assistantQueryManifestSchema.safeParse(output?.manifest);
    if (!parsed.success) continue;
    const manifest = parsed.data;
    periods.push(manifest.requestedPeriod);
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
  if (!periods.length) return null;
  const from = periods.map((period) => period.from).sort()[0];
  const to = periods.map((period) => period.to).sort().at(-1)!;
  const complete = [...latestByQuery.values()].every(Boolean);
  return {
    type: "data-summary",
    label: complete ? "Données Soma consultées" : "Données Soma consultées · analyse partielle",
    period: { from, to },
    itemCount,
    domains: [...domains],
  };
}
