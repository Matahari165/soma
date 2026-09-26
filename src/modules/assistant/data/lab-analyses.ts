import "server-only";

import {
  isPersonalLabPublishedRelation,
  selectMeaningfulRelations,
  type AnalysisPeriod,
  type MatrixRelation,
} from "@/domain/lab/matrix";
import { getPersonalLabSnapshot, type PersonalLabSnapshot } from "@/services/personal-lab";

export const ASSISTANT_LAB_ANALYSIS_PERIODS = [15, 30, 90, "all"] as const;
export type AssistantLabAnalysisMode = "summary" | "details" | "compare";

export type AssistantLabAnalysisQuery = {
  periods?: AnalysisPeriod[];
  predictorId?: string;
  outcomeId?: string;
  mode?: AssistantLabAnalysisMode;
  includeExploratory?: boolean;
  offset?: number;
  limit?: number;
};

type RelationStatus = "published" | "exploratory" | "insufficient" | "excluded";

type CatalogVariable = {
  id: string;
  label: string;
  unit: string;
  kind?: MatrixRelation["predictorKind"];
  role: "predictor" | "outcome" | "both";
};

type DetailedRelation = {
  id: string;
  pairId: string;
  period: AnalysisPeriod;
  status: RelationStatus;
  predictorId: string;
  predictor: string;
  predictorUnit: string;
  predictorKind: MatrixRelation["predictorKind"];
  outcomeId: string;
  outcome: string;
  outcomeUnit: string;
  effectUnit: string;
  comparison: string;
  model: MatrixRelation["modelType"];
  modelImprovement: number;
  nonlinearTested: boolean;
  coefficient: number | null;
  effect: number | null;
  effectConfidenceLow: number | null;
  effectConfidenceHigh: number | null;
  confidenceLow: number;
  confidenceHigh: number;
  percentEffect: number | null;
  baselineMean: number | null;
  comparisonMean: number | null;
  baselineCount: number;
  comparisonCount: number;
  sampleSize: number;
  effectiveSampleSize: number;
  pValue: number;
  qValue: number;
  evidence: MatrixRelation["evidence"];
  lagDays: number;
  grain: MatrixRelation["grain"];
  timeScale: MatrixRelation["timeScale"];
  method: MatrixRelation["method"];
  stable: boolean;
  stability: MatrixRelation["stability"];
  practicalThreshold: number;
  practicalRatio: number;
  practicallyMeaningful: boolean;
  coverageBySource: MatrixRelation["coverageBySource"];
  sourceEstimates: MatrixRelation["sourceEstimates"];
  doseResponse: MatrixRelation["doseResponse"];
  exclusionReasons: string[];
};

type PeriodData = {
  period: AnalysisPeriod;
  snapshot: PersonalLabSnapshot;
  relations: MatrixRelation[];
};

function normalizePeriods(periods?: AnalysisPeriod[]) {
  const requested: AnalysisPeriod[] = periods?.length ? periods : [90];
  const unique = [...new Set<AnalysisPeriod>(requested)];
  const supported = new Set<AnalysisPeriod>(ASSISTANT_LAB_ANALYSIS_PERIODS);
  if (unique.some((period) => !supported.has(period))) {
    throw new Error("Unsupported Personal Lab analysis period.");
  }
  return unique;
}

function relationStatus(relation: MatrixRelation): RelationStatus {
  if (relation.excluded) return "excluded";
  if (relation.coefficient === null || relation.effect === null || relation.evidence === "insufficient") return "insufficient";
  if (isPersonalLabPublishedRelation(relation)) return "published";
  return "exploratory";
}

function stablePairId(relation: Pick<MatrixRelation, "predictorId" | "outcomeId">) {
  return JSON.stringify([relation.predictorId, relation.outcomeId]);
}

function stableRelationId(relation: Pick<MatrixRelation, "predictorId" | "outcomeId" | "lagDays" | "grain" | "timeScale">) {
  // Intentionally excludes the selected model and its comparison label so the
  // same relation can be followed when its model changes between periods.
  return JSON.stringify([relation.predictorId, relation.outcomeId, relation.lagDays, relation.grain, relation.timeScale]);
}

function toDetailedRelation(relation: MatrixRelation): DetailedRelation {
  return {
    id: stableRelationId(relation),
    pairId: stablePairId(relation),
    period: relation.period,
    status: relationStatus(relation),
    predictorId: relation.predictorId,
    predictor: relation.predictorLabel,
    predictorUnit: relation.predictorUnit,
    predictorKind: relation.predictorKind,
    outcomeId: relation.outcomeId,
    outcome: relation.outcomeLabel,
    outcomeUnit: relation.outcomeUnit,
    effectUnit: relation.outcomeUnit,
    comparison: relation.comparisonLabel,
    model: relation.modelType,
    modelImprovement: relation.modelImprovement,
    nonlinearTested: relation.nonlinearTested,
    coefficient: relation.coefficient,
    effect: relation.effect,
    effectConfidenceLow: relation.effectConfidenceLow,
    effectConfidenceHigh: relation.effectConfidenceHigh,
    confidenceLow: relation.confidenceLow,
    confidenceHigh: relation.confidenceHigh,
    percentEffect: relation.percentEffect,
    baselineMean: relation.baselineMean,
    comparisonMean: relation.comparisonMean,
    baselineCount: relation.baselineCount,
    comparisonCount: relation.comparisonCount,
    sampleSize: relation.sampleSize,
    effectiveSampleSize: relation.effectiveSampleSize,
    pValue: relation.pValue,
    qValue: relation.qValue,
    evidence: relation.evidence,
    lagDays: relation.lagDays,
    grain: relation.grain,
    timeScale: relation.timeScale,
    method: relation.method,
    stable: relation.stable,
    stability: relation.stability,
    practicalThreshold: relation.practicalThreshold,
    practicalRatio: relation.practicalRatio,
    practicallyMeaningful: relation.practicallyMeaningful,
    coverageBySource: relation.coverageBySource,
    sourceEstimates: relation.sourceEstimates,
    doseResponse: relation.doseResponse,
    exclusionReasons: relation.exclusionReasons,
  };
}

function buildCatalog(periods: PeriodData[]) {
  const variables = new Map<string, Omit<CatalogVariable, "role"> & { predictor: boolean; outcome: boolean }>();
  for (const { snapshot } of periods) {
    for (const item of snapshot.matrix.coverageByMetric) {
      const current = variables.get(item.id);
      const metric = snapshot.metricRegistry.find((candidate) => candidate.id === item.id);
      variables.set(item.id, {
        id: item.id,
        label: item.label,
        unit: metric?.unit ?? current?.unit ?? "",
        kind: current?.kind,
        predictor: true,
        outcome: current?.outcome ?? false,
      });
    }
    for (const outcome of snapshot.matrix.outcomes) {
      const current = variables.get(outcome.id);
      variables.set(outcome.id, {
        id: outcome.id,
        label: outcome.label,
        unit: outcome.unit,
        kind: current?.kind,
        predictor: current?.predictor ?? false,
        outcome: true,
      });
    }
    for (const relation of snapshot.matrix.rows.flatMap((row) => row.relations)) {
      const currentPredictor = variables.get(relation.predictorId);
      variables.set(relation.predictorId, {
        id: relation.predictorId,
        label: relation.predictorLabel,
        unit: relation.predictorUnit,
        kind: relation.predictorKind,
        predictor: true,
        outcome: currentPredictor?.outcome ?? false,
      });
      const current = variables.get(relation.outcomeId);
      variables.set(relation.outcomeId, {
        id: relation.outcomeId,
        label: relation.outcomeLabel,
        unit: relation.outcomeUnit,
        kind: current?.kind,
        predictor: current?.predictor ?? false,
        outcome: true,
      });
    }
  }
  return [...variables.values()].map(({ predictor, outcome, ...variable }): CatalogVariable => ({
    ...variable,
    role: predictor && outcome ? "both" : predictor ? "predictor" : "outcome",
  })).sort((first, second) => first.label.localeCompare(second.label));
}

function filterRelations(relations: MatrixRelation[], query: AssistantLabAnalysisQuery) {
  return relations.filter((relation) =>
    (!query.predictorId || relation.predictorId === query.predictorId)
    && (!query.outcomeId || relation.outcomeId === query.outcomeId));
}

function countsFor(relations: MatrixRelation[], query: AssistantLabAnalysisQuery) {
  const counts = { evaluated: relations.length, published: 0, exploratory: 0, insufficient: 0, excluded: 0, filtered: 0, absent: 0 };
  for (const relation of relations) {
    const status = relationStatus(relation);
    counts[status] += 1;
    if (status === "excluded" || (status === "exploratory" && !query.includeExploratory)) counts.filtered += 1;
  }
  return counts;
}

function absentPairCount(relations: MatrixRelation[], query: AssistantLabAnalysisQuery, catalog: CatalogVariable[]) {
  if (!query.predictorId && !query.outcomeId) return 0;
  const predictors = catalog.filter((item) => ["predictor", "both"].includes(item.role)
    && (!query.predictorId || item.id === query.predictorId));
  const outcomes = catalog.filter((item) => ["outcome", "both"].includes(item.role)
    && (!query.outcomeId || item.id === query.outcomeId));
  if ((query.predictorId && !predictors.length) || (query.outcomeId && !outcomes.length)) return 0;
  const expected = predictors.length * outcomes.length;
  const present = new Set(relations.map(stablePairId)).size;
  return Math.max(0, expected - present);
}

function isVisible(relation: MatrixRelation, includeExploratory: boolean) {
  const status = relationStatus(relation);
  return status === "published" || (includeExploratory && status === "exploratory");
}

function representativeRelations(relations: MatrixRelation[], includeExploratory: boolean) {
  const published = selectMeaningfulRelations(relations, relations.length);
  if (!includeExploratory) return published;
  const selected = new Map(published.map((relation) => [stablePairId(relation), relation]));
  const candidates = relations.filter((relation) => relationStatus(relation) === "exploratory");
  for (const relation of candidates.sort((first, second) =>
    first.qValue - second.qValue
    || second.practicalRatio - first.practicalRatio
    || second.sampleSize - first.sampleSize)) {
    if (!selected.has(stablePairId(relation))) selected.set(stablePairId(relation), relation);
  }
  return [...selected.values()];
}

function paginate<T>(items: T[], offset: number, limit: number) {
  const pageItems = items.slice(offset, offset + limit);
  const nextOffset = offset + pageItems.length;
  return {
    items: pageItems,
    pagination: { offset, limit, total: items.length, hasMore: nextOffset < items.length, nextOffset: nextOffset < items.length ? nextOffset : null },
  };
}

function comparePeriods(periodData: PeriodData[], query: AssistantLabAnalysisQuery, catalog: CatalogVariable[]) {
  const selectedByPeriod = periodData.map(({ period, relations }) => {
    const matching = filterRelations(relations, query);
    return {
      period,
      matching,
      selected: representativeRelations(matching, query.includeExploratory ?? false),
    };
  });
  const pairIds = new Set(selectedByPeriod.flatMap(({ selected }) => selected.map(stablePairId)));
  // Include pairs that only have insufficient or filtered candidates so a
  // comparison can distinguish them from pairs that were never evaluated.
  selectedByPeriod.forEach(({ matching }) => matching.forEach((relation) => pairIds.add(stablePairId(relation))));
  if (query.predictorId && query.outcomeId
    && catalog.some((item) => item.id === query.predictorId && ["predictor", "both"].includes(item.role))
    && catalog.some((item) => item.id === query.outcomeId && ["outcome", "both"].includes(item.role))) {
    pairIds.add(JSON.stringify([query.predictorId, query.outcomeId]));
  }

  const comparisons = [...pairIds].map((pairId) => {
    const [predictorId, outcomeId] = JSON.parse(pairId) as [string, string];
    const predictor = catalog.find((item) => item.id === predictorId);
    const outcome = catalog.find((item) => item.id === outcomeId);
    const byPeriod = selectedByPeriod.map(({ period, matching, selected }) => {
      const relation = selected.find((candidate) => stablePairId(candidate) === pairId);
      if (relation) return { period, status: relationStatus(relation), relation: toDetailedRelation(relation) };
      const candidates = matching.filter((candidate) => stablePairId(candidate) === pairId);
      const status = !candidates.length ? "absent"
        : candidates.every((candidate) => candidate.excluded) ? "excluded"
        : candidates.every((candidate) => candidate.coefficient === null || candidate.evidence === "insufficient") ? "insufficient"
        : "filtered";
      return { period, status, relation: null };
    });
    const found = byPeriod.flatMap((item) => item.relation ? [item.relation] : []);
    return {
      id: pairId,
      predictorId,
      predictor: predictor?.label ?? byPeriod.find((item) => item.relation)?.relation?.predictor ?? predictorId,
      predictorUnit: predictor?.unit ?? "",
      outcomeId,
      outcome: outcome?.label ?? byPeriod.find((item) => item.relation)?.relation?.outcome ?? outcomeId,
      outcomeUnit: outcome?.unit ?? "",
      byPeriod,
      modelChanged: new Set(found.map((relation) => relation.model)).size > 1,
      lagChanged: new Set(found.map((relation) => relation.lagDays)).size > 1,
      directionChanged: new Set(found.map((relation) => Math.sign(relation.effect ?? 0))).size > 1,
    };
  }).sort((first, second) => first.predictor.localeCompare(second.predictor) || first.outcome.localeCompare(second.outcome));
  return { comparisons, selectedByPeriod };
}

function expectedAbsences(periodData: PeriodData[], query: AssistantLabAnalysisQuery, catalog: CatalogVariable[]) {
  if (!query.predictorId || !query.outcomeId
    || !catalog.some((item) => item.id === query.predictorId && ["predictor", "both"].includes(item.role))
    || !catalog.some((item) => item.id === query.outcomeId && ["outcome", "both"].includes(item.role))) return 0;
  return periodData.reduce((total, { relations }) => total + Number(!relations.some((relation) => relation.predictorId === query.predictorId && relation.outcomeId === query.outcomeId)), 0);
}

function periodStartDate(period: AnalysisPeriod, endDate: string) {
  if (period === "all") return null;
  const start = new Date(`${endDate}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (period - 1));
  return start.toISOString().slice(0, 10);
}

/**
 * Reads Soma's already calculated matrix for the requested windows. Each
 * single-period snapshot uses the existing period cache and only rebuilds
 * that window when Soma's cache has expired or its inputs changed.
 */
export async function loadAssistantLabAnalyses(userId: string, query: AssistantLabAnalysisQuery = {}) {
  if (!userId) throw new Error("Authenticated user is required.");
  const periods = normalizePeriods(query.periods);
  const mode = query.mode ?? "summary";
  const offset = Math.max(0, Math.trunc(query.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Math.trunc(query.limit ?? 40)));
  const snapshots = await Promise.all(periods.map(async (period) => ({
    period,
    snapshot: await getPersonalLabSnapshot({ id: userId, email: null, displayName: "" }, { periods: [period] }),
  })));
  const periodData: PeriodData[] = snapshots.map(({ period, snapshot }) => ({
    period,
    snapshot,
    relations: snapshot.matrix.rows.filter((row) => row.period === period).flatMap((row) => row.relations),
  }));
  const catalog = buildCatalog(periodData);
  const missingFilters = [
    ...(query.predictorId && !catalog.some((item) => item.id === query.predictorId && ["predictor", "both"].includes(item.role)) ? ["predictorId"] : []),
    ...(query.outcomeId && !catalog.some((item) => item.id === query.outcomeId && ["outcome", "both"].includes(item.role)) ? ["outcomeId"] : []),
  ];
  const includeExploratory = query.includeExploratory ?? false;
  const summaries = periodData.map(({ period, snapshot, relations }) => {
    const matching = filterRelations(relations, query);
    const counts = countsFor(matching, query);
    counts.absent = missingFilters.length ? 0 : absentPairCount(matching, query, catalog);
    return {
      period,
      analysisEndDate: snapshot.matrix.analysisEndDate,
      periodStartDate: periodStartDate(period, snapshot.matrix.analysisEndDate),
      counts,
      matchingPairs: new Set(matching.map(stablePairId)).size,
      availableOutcomes: snapshot.matrix.outcomes.length,
    };
  });

  const caveat = "Les relations sont des associations calculées par Soma, pas une preuve de causalité. Une absence, une couverture faible ou un résultat insuffisant ne signifie pas un effet nul.";
  if (mode === "compare") {
    const { comparisons, selectedByPeriod } = comparePeriods(periodData, { ...query, includeExploratory }, catalog);
    const page = paginate(comparisons, offset, limit);
    return {
      mode,
      periods,
      filters: { predictorId: query.predictorId ?? null, outcomeId: query.outcomeId ?? null, includeExploratory },
      missingFilters,
      catalog,
      summaries: summaries.map((summary, index) => ({
        ...summary,
        counts: {
          ...countsFor(selectedByPeriod[index].matching, { ...query, includeExploratory }),
          absent: missingFilters.length ? 0 : absentPairCount(selectedByPeriod[index].matching, query, catalog),
        },
      })),
      comparisons: page.items,
      pagination: page.pagination,
      absentPairCount: expectedAbsences(periodData, query, catalog),
      caveat,
    };
  }

  const allRelations = periodData.flatMap(({ period, relations }) => {
    const matching = filterRelations(relations, query);
    const selected = mode === "summary"
      ? representativeRelations(matching, includeExploratory)
      : matching.filter((relation) => isVisible(relation, includeExploratory));
    return selected.map(toDetailedRelation).map((relation) => ({ ...relation, period }));
  }).sort((first, second) => periods.indexOf(first.period) - periods.indexOf(second.period)
    || first.predictor.localeCompare(second.predictor)
    || first.outcome.localeCompare(second.outcome)
    || first.lagDays - second.lagDays);
  const page = paginate(allRelations, offset, limit);
  return {
    mode,
    periods,
    filters: { predictorId: query.predictorId ?? null, outcomeId: query.outcomeId ?? null, includeExploratory },
    missingFilters,
    catalog,
    summaries,
    relations: page.items,
    pagination: page.pagination,
    caveat,
  };
}
