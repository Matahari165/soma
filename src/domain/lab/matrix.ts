export const MINIMUM_DAILY_OBSERVATIONS = 10;
export const MINIMUM_WEEKLY_OBSERVATIONS = 10;
export const MINIMUM_DAILY_HIGHLIGHT = 10;
export const MINIMUM_WEEKLY_HIGHLIGHT = 10;
export const MINIMUM_BINARY_GROUP = 5;

export type AnalysisPeriod = 15 | 30 | 90 | "all";
export type MatrixPoint = { date: string; value: number; segment?: string };
export type MatrixSeries = {
  id: string;
  label: string;
  unit: string;
  kind: "numeric" | "binary";
  presentation?: "amount" | "clock-time";
  points: MatrixPoint[];
};
export type MatrixSourceEstimate = { source: string; sampleSize: number; effect: number; effectConfidenceLow: number; effectConfidenceHigh: number; coefficient: number; pValue: number };
export type MatrixSourceCoverage = { source: string; pairedDays: number; pairedWeeks: number };
export type MatrixStability = {
  chronologicalBlocks: number;
  directionHeldInBlocks: boolean;
  trendAdjustedDirectionHeld: boolean;
  outlierAdjustedDirectionHeld: boolean;
};
export type MatrixRelation = {
  predictorId: string; predictorLabel: string; predictorUnit: string; predictorKind: MatrixSeries["kind"];
  predictorPresentation: NonNullable<MatrixSeries["presentation"]>; predictorLow: number | null; predictorHigh: number | null; predictorDelta: number | null;
  outcomeId: string; outcomeLabel: string; outcomeUnit: string;
  coefficient: number | null; effect: number | null; effectConfidenceLow: number | null; effectConfidenceHigh: number | null;
  percentEffect: number | null; baselineMean: number | null; comparisonMean: number | null;
  baselineCount: number; comparisonCount: number; comparisonLabel: string;
  sampleSize: number; effectiveSampleSize: number; pValue: number; qValue: number; confidenceLow: number; confidenceHigh: number;
  relevance: number; lagDays: number; grain: "day" | "week"; timeScale: "acute" | "chronic"; period: AnalysisPeriod;
  family: "automatic-acute" | "automatic-chronic" | "journal-acute" | "journal-chronic";
  method: "raw-within-person-hac";
  evidence: "insufficient" | "exploratory" | "promising" | "established";
  stable: boolean; stability: MatrixStability; strength: "hidden" | "light" | "clear" | "strong";
  coverageBySource: MatrixSourceCoverage[]; sourceEstimates: MatrixSourceEstimate[];
  featureEligible: boolean; exclusionReasons: string[]; excluded: boolean;
};
export type MatrixRelationOptions = {
  grain?: "day" | "week";
  timeScale?: "acute" | "chronic";
  family?: MatrixRelation["family"];
  minimumMeaningfulEffect?: number;
  period?: AnalysisPeriod;
  outcomeDirection?: "higher" | "lower" | "target";
  outcomeTarget?: number;
};

type Pair = { date: string; predictor: number; outcome: number; segment: string };
type Estimate = {
  effect: number; standardError: number; pValue: number; coefficient: number;
  predictorLow: number; predictorHigh: number; predictorDelta: number;
  baselineMean: number; comparisonMean: number; baselineCount: number; comparisonCount: number; comparisonLabel: string;
};

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
function mean(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}
function quantile(values: number[], probability: number) {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? ordered[lower] : ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower);
}
function ranks(values: number[]) {
  const ordered = values.map((value, index) => ({ value, index })).sort((first, second) => first.value - second.value);
  const result = Array(values.length).fill(0) as number[];
  let start = 0;
  while (start < ordered.length) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1].value === ordered[start].value) end += 1;
    const rank = (start + end) / 2 + 1;
    for (let index = start; index <= end; index += 1) result[ordered[index].index] = rank;
    start = end + 1;
  }
  return result;
}
function winsorize(values: number[]) {
  const low = quantile(values, .025);
  const high = quantile(values, .975);
  return values.map((value) => Math.max(low, Math.min(high, value)));
}
function centerWithinSources(values: number[], pairs: Pair[]) {
  const totals = new Map<string, { sum: number; count: number }>();
  values.forEach((value, index) => {
    const source = pairs[index].segment;
    const current = totals.get(source) ?? { sum: 0, count: 0 };
    totals.set(source, { sum: current.sum + value, count: current.count + 1 });
  });
  return values.map((value, index) => {
    const source = totals.get(pairs[index].segment);
    return value - (source ? source.sum / source.count : 0);
  });
}
function round(value: number, digits = 3) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
function normalPValue(statistic: number) {
  const cdf = 0.5 * (1 + erf(Math.abs(statistic) / Math.SQRT2));
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

function clockTime(minutes: number) {
  const normalized = Math.round(minutes) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function pairedPoints(predictor: MatrixSeries, outcome: MatrixSeries, lagDays: number) {
  const outcomes = new Map(outcome.points.map((point) => [point.date, point]));
  return predictor.points.flatMap((point): Pair[] => {
    const outcomePoint = outcomes.get(addDays(point.date, lagDays));
    if (!outcomePoint) return [];
    if (point.segment && outcomePoint.segment && point.segment !== outcomePoint.segment) return [];
    return [{ date: point.date, predictor: point.value, outcome: outcomePoint.value, segment: point.segment ?? outcomePoint.segment ?? "All data" }];
  }).sort((first, second) => first.date.localeCompare(second.date));
}

function coverage(pairs: Pair[], grain: "day" | "week") {
  const grouped = new Map<string, number>();
  for (const pair of pairs) grouped.set(pair.segment, (grouped.get(pair.segment) ?? 0) + 1);
  return [...grouped].map(([source, count]) => ({ source, pairedDays: grain === "day" ? count : 0, pairedWeeks: grain === "week" ? count : 0 }));
}

function hacStandardError(pairs: Pair[], centeredPredictor: number[], residuals: number[]) {
  const denominator = centeredPredictor.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return 0;
  const scores = centeredPredictor.map((value, index) => value * residuals[index]);
  const maximumLag = Math.min(7, Math.floor(pairs.length / 4));
  let meat = scores.reduce((sum, score) => sum + score * score, 0);
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    const weight = 1 - lag / (maximumLag + 1);
    let covariance = 0;
    for (let index = lag; index < scores.length; index += 1) {
      if (pairs[index].segment === pairs[index - lag].segment) covariance += scores[index] * scores[index - lag];
    }
    meat += 2 * weight * covariance;
  }
  return Math.sqrt(Math.max(0, meat / (denominator * denominator)));
}

function fitBestZoneEstimate(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions): Estimate | null {
  if (series.presentation !== "clock-time" || pairs.length < 30) return null;
  const direction = options.outcomeDirection;
  if (!direction || (direction === "target" && options.outcomeTarget === undefined)) return null;
  const predictors = pairs.map((pair) => pair.predictor);
  const lowerBoundary = quantile(predictors, 1 / 3);
  const upperBoundary = quantile(predictors, 2 / 3);
  if (upperBoundary - lowerBoundary < 15) return null;
  const groups = [
    pairs.filter((pair) => pair.predictor <= lowerBoundary),
    pairs.filter((pair) => pair.predictor > lowerBoundary && pair.predictor <= upperBoundary),
    pairs.filter((pair) => pair.predictor > upperBoundary),
  ];
  if (groups.some((group) => group.length < 8)) return null;
  const sourceCenteredOutcomes = centerWithinSources(pairs.map((pair) => pair.outcome), pairs);
  const globalOutcomeMean = mean(pairs.map((pair) => pair.outcome));
  const adjustedOutcomeByDate = new Map(pairs.map((pair, index) => [pair.date, sourceCenteredOutcomes[index] + globalOutcomeMean]));
  const groupMeans = groups.map((group) => mean(group.map((pair) => adjustedOutcomeByDate.get(pair.date) ?? pair.outcome)));
  const outcomeSpread = standardDeviation(pairs.map((pair) => pair.outcome));
  const materialDifference = Math.max(options.minimumMeaningfulEffect ?? 0, outcomeSpread * .15);
  const middleIsBetter = direction === "higher"
    ? groupMeans[1] - groupMeans[0] >= materialDifference && groupMeans[1] - groupMeans[2] >= materialDifference
    : direction === "lower"
      ? groupMeans[0] - groupMeans[1] >= materialDifference && groupMeans[2] - groupMeans[1] >= materialDifference
      : Math.abs(groupMeans[0] - (options.outcomeTarget as number)) - Math.abs(groupMeans[1] - (options.outcomeTarget as number)) >= materialDifference
        && Math.abs(groupMeans[2] - (options.outcomeTarget as number)) - Math.abs(groupMeans[1] - (options.outcomeTarget as number)) >= materialDifference;
  if (!middleIsBetter) return null;
  const indicator = pairs.map((pair) => pair.predictor > lowerBoundary && pair.predictor <= upperBoundary ? 1 : 0);
  const centered = centerWithinSources(indicator, pairs);
  const centeredOutcomes = centerWithinSources(pairs.map((pair) => pair.outcome), pairs);
  const denominator = centered.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return null;
  const effect = centered.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
  const residuals = centeredOutcomes.map((outcome, index) => outcome - effect * centered[index]);
  const standardError = hacStandardError(pairs, centered, residuals);
  const baselineMean = mean(pairs.map((pair) => pair.outcome)) - effect * mean(indicator);
  const comparisonMean = baselineMean + effect;
  return {
    effect,
    standardError,
    pValue: Math.min(1, 3 * (standardError < 1e-12 ? (Math.abs(effect) < 1e-12 ? 1 : 0) : normalPValue(effect / standardError))),
    coefficient: effect / (outcomeSpread || 1),
    predictorLow: lowerBoundary,
    predictorHigh: upperBoundary,
    predictorDelta: upperBoundary - lowerBoundary,
    baselineMean,
    comparisonMean,
    baselineCount: groups[0].length + groups[2].length,
    comparisonCount: groups[1].length,
    comparisonLabel: `best zone ${clockTime(lowerBoundary)}–${clockTime(upperBoundary)}`,
  };
}

function fitEstimate(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions): Estimate | null {
  if (pairs.length < MINIMUM_DAILY_OBSERVATIONS || standardDeviation(pairs.map((pair) => pair.outcome)) < 1e-10) return null;
  const bestZone = fitBestZoneEstimate(pairs, series, options);
  if (bestZone) return bestZone;
  const values = pairs.map((pair) => pair.predictor);
  const zeros = pairs.filter((pair) => pair.predictor === 0);
  const positives = pairs.filter((pair) => pair.predictor > 0);
  const exposedComparison = series.kind === "binary" || (series.presentation === "amount" && zeros.length >= MINIMUM_BINARY_GROUP && positives.length >= MINIMUM_BINARY_GROUP);
  if (exposedComparison) {
    const baseline = series.kind === "binary" ? pairs.filter((pair) => pair.predictor === 0) : zeros;
    const comparison = series.kind === "binary" ? pairs.filter((pair) => pair.predictor === 1) : positives;
    if (baseline.length < MINIMUM_BINARY_GROUP || comparison.length < MINIMUM_BINARY_GROUP) return null;
    const x = pairs.map((pair) => pair.predictor > 0 ? 1 : 0);
    const centered = centerWithinSources(x, pairs);
    const centeredOutcomes = centerWithinSources(pairs.map((pair) => pair.outcome), pairs);
    const denominator = centered.reduce((sum, value) => sum + value * value, 0);
    if (denominator < 1e-10) return null;
    const effect = centered.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
    const residuals = centeredOutcomes.map((outcome, index) => outcome - effect * centered[index]);
    const standardError = hacStandardError(pairs, centered, residuals);
    const baselineMean = mean(pairs.map((pair) => pair.outcome)) - effect * mean(x);
    const comparisonMean = baselineMean + effect;
    const averagePositive = series.kind === "binary" ? 1 : mean(positives.map((pair) => pair.predictor));
    return {
      effect, standardError,
      pValue: standardError < 1e-12 ? (Math.abs(effect) < 1e-12 ? 1 : 0) : normalPValue(effect / standardError),
      coefficient: effect / (standardDeviation(pairs.map((pair) => pair.outcome)) || 1),
      predictorLow: 0, predictorHigh: averagePositive, predictorDelta: averagePositive,
      baselineMean, comparisonMean, baselineCount: baseline.length, comparisonCount: comparison.length,
      comparisonLabel: series.kind === "binary" ? "yes vs no" : `${round(averagePositive, 1)} ${series.unit} avg vs 0`,
    };
  }
  const robustPredictors = winsorize(values);
  const robustOutcomes = winsorize(pairs.map((pair) => pair.outcome));
  const predictorMean = mean(robustPredictors);
  const centered = centerWithinSources(robustPredictors, pairs);
  const denominator = centered.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return null;
  const outcomeMean = mean(robustOutcomes);
  const centeredOutcomes = centerWithinSources(robustOutcomes, pairs);
  const slope = centered.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
  const contrast = series.presentation === "clock-time" ? 30 : Math.max(quantile(values, .75) - quantile(values, .25), 1e-9);
  const low = series.presentation === "clock-time" ? predictorMean : quantile(values, .25);
  const high = low + contrast;
  const effect = slope * contrast;
  const residuals = centeredOutcomes.map((outcome, index) => outcome - slope * centered[index]);
  const slopeStandardError = hacStandardError(pairs, centered, residuals);
  const standardError = slopeStandardError * contrast;
  const predictorRanks = ranks(values);
  const outcomeRanks = ranks(pairs.map((pair) => pair.outcome));
  const centeredRanks = centerWithinSources(predictorRanks, pairs);
  const centeredOutcomeRanks = centerWithinSources(outcomeRanks, pairs);
  const rankDenominator = centeredRanks.reduce((sum, value) => sum + value * value, 0);
  const rankSlope = centeredRanks.reduce((sum, value, index) => sum + value * centeredOutcomeRanks[index], 0) / rankDenominator;
  const rankResiduals = centeredOutcomeRanks.map((value, index) => value - rankSlope * centeredRanks[index]);
  const rankStandardError = hacStandardError(pairs, centeredRanks, rankResiduals);
  const rankCoefficient = rankSlope * standardDeviation(predictorRanks) / (standardDeviation(outcomeRanks) || 1);
  return {
    effect, standardError,
    pValue: rankStandardError < 1e-12 ? (Math.abs(rankSlope) < 1e-12 ? 1 : 0) : normalPValue(rankSlope / rankStandardError),
    coefficient: rankCoefficient,
    predictorLow: low, predictorHigh: high, predictorDelta: contrast,
    baselineMean: outcomeMean + slope * (low - predictorMean),
    comparisonMean: outcomeMean + slope * (high - predictorMean),
    baselineCount: pairs.length, comparisonCount: pairs.length,
    comparisonLabel: series.presentation === "clock-time" ? "30 min later" : `+${round(contrast, contrast >= 10 ? 0 : 1)}${series.unit ? ` ${series.unit}` : ""}`,
  };
}

function chronologicalDirection(pairs: Pair[]) {
  if (pairs.length < 12) return { blocks: 0, held: false };
  const fullX = mean(pairs.map((pair) => pair.predictor));
  const fullY = mean(pairs.map((pair) => pair.outcome));
  const direction = Math.sign(pairs.reduce((sum, pair) => sum + (pair.predictor - fullX) * (pair.outcome - fullY), 0));
  let blocks = 0;
  for (let block = 0; block < 4; block += 1) {
    const subset = pairs.slice(Math.floor(block * pairs.length / 4), Math.floor((block + 1) * pairs.length / 4));
    if (subset.length < 2) continue;
    const x = mean(subset.map((pair) => pair.predictor));
    const y = mean(subset.map((pair) => pair.outcome));
    const blockDirection = Math.sign(subset.reduce((sum, pair) => sum + (pair.predictor - x) * (pair.outcome - y), 0));
    if (blockDirection === direction) blocks += 1;
  }
  return { blocks, held: blocks >= 3 };
}

function finalizeRelation(relation: MatrixRelation, qValue: number): MatrixRelation {
  if (relation.coefficient === null) return { ...relation, qValue: 1, featureEligible: false };
  const significant = qValue < .05;
  return {
    ...relation, qValue, featureEligible: significant, stable: significant,
    evidence: significant ? "established" : "exploratory",
    strength: significant ? (Math.abs(relation.percentEffect ?? 0) >= 10 ? "strong" : "clear") : "light",
    relevance: significant ? Math.abs(relation.percentEffect ?? relation.coefficient ?? 0) * -Math.log10(Math.max(qValue, 1e-8)) * Math.log10(relation.sampleSize + 1) : 0,
    exclusionReasons: significant ? relation.exclusionReasons : [...new Set([...relation.exclusionReasons, "BH-adjusted q value is not below 0.05"])],
  };
}

export function adjustMatrixRelations(relations: MatrixRelation[]) {
  const calculable = relations.map((relation, index) => ({ relation, index }))
    .filter(({ relation }) => !relation.excluded && relation.coefficient !== null)
    .sort((first, second) => first.relation.pValue - second.relation.pValue);
  const qValues = new Map<number, number>();
  let previous = 1;
  for (let position = calculable.length - 1; position >= 0; position -= 1) {
    const item = calculable[position];
    const adjusted = Math.min(previous, item.relation.pValue * calculable.length / (position + 1), 1);
    qValues.set(item.index, adjusted);
    previous = adjusted;
  }
  return relations.map((relation, index) => finalizeRelation(relation, qValues.get(index) ?? 1));
}

export function calculateMatrixRelation(predictor: MatrixSeries, outcome: MatrixSeries, lagDays = 0, options: MatrixRelationOptions = {}): MatrixRelation {
  const grain = options.grain ?? "day";
  const timeScale = options.timeScale ?? "acute";
  const family = options.family ?? "automatic-acute";
  const period = options.period ?? "all";
  const pairs = pairedPoints(predictor, outcome, lagDays);
  const coverageBySource = coverage(pairs, grain);
  const estimate = fitEstimate(pairs, predictor, options);
  const stability = chronologicalDirection(pairs);
  const minimum = predictor.kind === "binary" ? `${MINIMUM_BINARY_GROUP} yes and ${MINIMUM_BINARY_GROUP} no days` : `${MINIMUM_DAILY_OBSERVATIONS} paired days`;
  const exclusionReasons = estimate ? [] : [`At least ${minimum} are required`];
  if (estimate && Math.abs(estimate.effect) < (options.minimumMeaningfulEffect ?? 0)) exclusionReasons.push("Effect is below the practical display threshold");
  const confidenceLow = estimate ? estimate.effect - 1.959963984540054 * estimate.standardError : null;
  const confidenceHigh = estimate ? estimate.effect + 1.959963984540054 * estimate.standardError : null;
  const outcomeScale = standardDeviation(pairs.map((pair) => pair.outcome)) || 1;
  const sourceName = coverageBySource.map((item) => item.source).join(" + ") || "All data";
  const relation: MatrixRelation = {
    predictorId: predictor.id, predictorLabel: predictor.label, predictorUnit: predictor.unit, predictorKind: predictor.kind,
    predictorPresentation: predictor.presentation ?? "amount",
    predictorLow: estimate ? round(estimate.predictorLow, 2) : null, predictorHigh: estimate ? round(estimate.predictorHigh, 2) : null, predictorDelta: estimate ? round(estimate.predictorDelta, 2) : null,
    outcomeId: outcome.id, outcomeLabel: outcome.label, outcomeUnit: outcome.unit,
    coefficient: estimate ? round(estimate.coefficient, 3) : null, effect: estimate ? round(estimate.effect, 1) : null,
    effectConfidenceLow: confidenceLow === null ? null : round(confidenceLow, 1), effectConfidenceHigh: confidenceHigh === null ? null : round(confidenceHigh, 1),
    percentEffect: estimate && Math.abs(estimate.baselineMean) > 1e-8 ? round(100 * estimate.effect / Math.abs(estimate.baselineMean), 1) : null,
    baselineMean: estimate ? round(estimate.baselineMean, 2) : null, comparisonMean: estimate ? round(estimate.comparisonMean, 2) : null,
    baselineCount: estimate?.baselineCount ?? 0, comparisonCount: estimate?.comparisonCount ?? 0, comparisonLabel: estimate?.comparisonLabel ?? "not enough data",
    sampleSize: pairs.length, effectiveSampleSize: pairs.length, pValue: estimate?.pValue ?? 1, qValue: estimate?.pValue ?? 1,
    confidenceLow: confidenceLow === null ? -1 : confidenceLow / outcomeScale, confidenceHigh: confidenceHigh === null ? 1 : confidenceHigh / outcomeScale,
    relevance: 0, lagDays, grain, timeScale, period, family, method: "raw-within-person-hac",
    evidence: estimate ? "exploratory" : "insufficient", stable: false,
    stability: { chronologicalBlocks: stability.blocks, directionHeldInBlocks: stability.held, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true },
    strength: estimate ? "light" : "hidden", coverageBySource,
    sourceEstimates: estimate ? [{ source: sourceName, sampleSize: pairs.length, effect: round(estimate.effect, 1), effectConfidenceLow: round(confidenceLow ?? estimate.effect, 1), effectConfidenceHigh: round(confidenceHigh ?? estimate.effect, 1), coefficient: round(estimate.coefficient, 3), pValue: estimate.pValue }] : [],
    featureEligible: false, exclusionReasons, excluded: false,
  };
  return finalizeRelation(relation, relation.pValue);
}

export function calculateCorrelationMatrix(predictors: MatrixSeries[], outcomes: MatrixSeries[], lagDays = 0) {
  return adjustMatrixRelations(predictors.flatMap((predictor) => outcomes.filter((outcome) => outcome.id !== predictor.id).map((outcome) => calculateMatrixRelation(predictor, outcome, lagDays))));
}
