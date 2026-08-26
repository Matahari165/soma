export const MINIMUM_DAILY_OBSERVATIONS = 10;
export const MINIMUM_WEEKLY_OBSERVATIONS = 10;
export const MINIMUM_DAILY_HIGHLIGHT = 10;
export const MINIMUM_WEEKLY_HIGHLIGHT = 10;
export const MINIMUM_BINARY_GROUP = 5;
const MINIMUM_NONLINEAR_OBSERVATIONS = 30;
const MINIMUM_NONLINEAR_GROUP = 8;
const MINIMUM_NONLINEAR_IMPROVEMENT = .1;
const MINIMUM_SHAPE_EFFECT_STANDARD_DEVIATIONS = .15;
const SEARCHED_NONLINEAR_SHAPES = 3;
const EXTREME_IMPORT_FENCE_MULTIPLIER = 6;
const J2_HIGHLIGHT_ADVANTAGE = 1.2;

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
export type MatrixModelType = "binary" | "linear" | "threshold" | "plateau" | "optimal-zone" | "adverse-zone" | "middle-zone";
export type MatrixDoseResponse = {
  comparisonLabel: string;
  effect: number;
  effectConfidenceLow: number;
  effectConfidenceHigh: number;
  percentEffect: number | null;
  baselineMean: number;
  comparisonMean: number;
  sampleSize: number;
  pValue: number;
  modelType: Exclude<MatrixModelType, "binary">;
  modelImprovement: number;
  nonlinearTested: boolean;
};
export type MatrixRelation = {
  predictorId: string; predictorLabel: string; predictorUnit: string; predictorKind: MatrixSeries["kind"];
  predictorPresentation: NonNullable<MatrixSeries["presentation"]>; predictorLow: number | null; predictorHigh: number | null; predictorDelta: number | null;
  outcomeId: string; outcomeLabel: string; outcomeUnit: string;
  coefficient: number | null; effect: number | null; effectConfidenceLow: number | null; effectConfidenceHigh: number | null;
  percentEffect: number | null; baselineMean: number | null; comparisonMean: number | null;
  baselineCount: number; comparisonCount: number; comparisonLabel: string;
  modelType: MatrixModelType; modelImprovement: number; nonlinearTested: boolean;
  sampleSize: number; effectiveSampleSize: number; pValue: number; qValue: number; confidenceLow: number; confidenceHigh: number;
  relevance: number; lagDays: number; grain: "day" | "week"; timeScale: "acute" | "chronic"; period: AnalysisPeriod;
  family: "automatic-acute" | "automatic-chronic" | "journal-acute" | "journal-chronic";
  method: "raw-within-person-hac";
  evidence: "insufficient" | "exploratory" | "promising" | "established";
  stable: boolean; stability: MatrixStability; strength: "hidden" | "light" | "clear" | "strong";
  coverageBySource: MatrixSourceCoverage[]; sourceEstimates: MatrixSourceEstimate[];
  doseResponse: MatrixDoseResponse | null;
  habitualPredictorDelta: number | null; habitualEffect: number | null;
  practicallyMeaningful: boolean; practicalThreshold: number; practicalRatio: number;
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
  modelType: MatrixModelType; modelImprovement: number;
  habitualPredictorDelta: number | null; habitualEffect: number | null;
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
export function protectAgainstExtremeImportErrors(values: number[]) {
  const lowerQuartile = quantile(values, .25);
  const upperQuartile = quantile(values, .75);
  const spread = upperQuartile - lowerQuartile;
  if (spread <= 0) return [...values];
  const low = lowerQuartile - EXTREME_IMPORT_FENCE_MULTIPLIER * spread;
  const high = upperQuartile + EXTREME_IMPORT_FENCE_MULTIPLIER * spread;
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
function niceContrast(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const normalized = value / exponent;
  const step = normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return step * exponent;
}
function relativePercent(effect: number, baselineMean: number, outcomeUnit: string) {
  const ratioScaleUnits = new Set(["min", "ms", "bpm", "count", "/h", "/min", "steps", "kcal", "km", "kg", "g", "mg"]);
  return ratioScaleUnits.has(outcomeUnit) && Math.abs(baselineMean) > 1e-8
    ? round(100 * effect / Math.abs(baselineMean), 1)
    : null;
}
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

function predictorValue(value: number, series: MatrixSeries) {
  if (series.presentation === "clock-time") return clockTime(value);
  return `${round(value, Math.abs(value) >= 10 ? 0 : 1)}${series.unit ? ` ${series.unit}` : ""}`;
}

function desirability(value: number, options: MatrixRelationOptions) {
  if (options.outcomeDirection === "lower") return -value;
  if (options.outcomeDirection === "target" && options.outcomeTarget !== undefined) return -Math.abs(value - options.outcomeTarget);
  return value;
}

function fitIndicatorEstimate(input: {
  pairs: Pair[];
  indicator: number[];
  outcomeSpread: number;
  predictorLow: number;
  predictorHigh: number;
  comparisonLabel: string;
  modelType: Exclude<MatrixModelType, "binary" | "linear">;
  modelImprovement: number;
}): Estimate | null {
  const centered = centerWithinSources(input.indicator, input.pairs);
  const centeredOutcomes = centerWithinSources(input.pairs.map((pair) => pair.outcome), input.pairs);
  const denominator = centered.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return null;
  const effect = centered.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
  const residuals = centeredOutcomes.map((outcome, index) => outcome - effect * centered[index]);
  const standardError = hacStandardError(input.pairs, centered, residuals);
  const baselineMean = mean(input.pairs.map((pair) => pair.outcome)) - effect * mean(input.indicator);
  return {
    effect,
    standardError,
    pValue: Math.min(1, SEARCHED_NONLINEAR_SHAPES * (standardError < 1e-12 ? (Math.abs(effect) < 1e-12 ? 1 : 0) : normalPValue(effect / standardError))),
    coefficient: effect / (input.outcomeSpread || 1),
    predictorLow: input.predictorLow,
    predictorHigh: input.predictorHigh,
    predictorDelta: input.predictorHigh - input.predictorLow,
    baselineMean,
    comparisonMean: baselineMean + effect,
    baselineCount: input.indicator.filter((value) => value === 0).length,
    comparisonCount: input.indicator.filter((value) => value === 1).length,
    comparisonLabel: input.comparisonLabel,
    modelType: input.modelType,
    modelImprovement: input.modelImprovement,
    habitualPredictorDelta: null,
    habitualEffect: null,
  };
}

function nonlinearTestEligible(pairs: Pair[], series: MatrixSeries) {
  if (series.kind !== "numeric" || pairs.length < MINIMUM_NONLINEAR_OBSERVATIONS) return false;
  const predictors = pairs.map((pair) => pair.predictor);
  const lowerBoundary = quantile(predictors, 1 / 3);
  const upperBoundary = quantile(predictors, 2 / 3);
  if (upperBoundary - lowerBoundary < (series.presentation === "clock-time" ? 15 : 1e-9)) return false;
  const counts = [0, 1, 2].map((group) => predictors.filter((value) => (value <= lowerBoundary ? 0 : value <= upperBoundary ? 1 : 2) === group).length);
  return counts.every((count) => count >= MINIMUM_NONLINEAR_GROUP);
}

function fitNonlinearEstimate(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions): Estimate | null {
  if (!nonlinearTestEligible(pairs, series)) return null;
  const predictors = pairs.map((pair) => pair.predictor);
  const lowerBoundary = quantile(predictors, 1 / 3);
  const upperBoundary = quantile(predictors, 2 / 3);
  const groupIndexes = predictors.map((value) => value <= lowerBoundary ? 0 : value <= upperBoundary ? 1 : 2);

  const rawOutcomes = pairs.map((pair) => pair.outcome);
  const centeredOutcomes = centerWithinSources(rawOutcomes, pairs);
  const adjustedOutcomes = centeredOutcomes.map((value) => value + mean(rawOutcomes));
  const groupMeans = [0, 1, 2].map((group) => mean(adjustedOutcomes.filter((_, index) => groupIndexes[index] === group)));
  const outcomeSpread = standardDeviation(rawOutcomes);
  const materialDifference = Math.max(options.minimumMeaningfulEffect ?? 0, outcomeSpread * MINIMUM_SHAPE_EFFECT_STANDARD_DEVIATIONS);

  const centeredPredictors = centerWithinSources(protectAgainstExtremeImportErrors(predictors), pairs);
  const linearDenominator = centeredPredictors.reduce((sum, value) => sum + value * value, 0);
  if (linearDenominator < 1e-10) return null;
  const linearSlope = centeredPredictors.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / linearDenominator;
  const linearSse = centeredOutcomes.reduce((sum, value, index) => sum + (value - linearSlope * centeredPredictors[index]) ** 2, 0);
  if (linearSse < 1e-10) return null;

  const candidates: Array<{ indicator: number[]; valid: boolean; label: string; modelType: Exclude<MatrixModelType, "binary" | "linear">; low: number; high: number }> = [];
  const highDifference = groupMeans[2] - (groupMeans[0] + groupMeans[1]) / 2;
  candidates.push({
    indicator: groupIndexes.map((group) => group === 2 ? 1 : 0),
    valid: Math.abs(highDifference) >= materialDifference && Math.abs(groupMeans[1] - groupMeans[0]) <= Math.max(materialDifference, Math.abs(highDifference) * .5),
    label: `threshold above ${predictorValue(upperBoundary, series)}`,
    modelType: "threshold",
    low: upperBoundary,
    high: Math.max(...predictors),
  });
  const plateauDifference = (groupMeans[1] + groupMeans[2]) / 2 - groupMeans[0];
  candidates.push({
    indicator: groupIndexes.map((group) => group === 0 ? 0 : 1),
    valid: Math.abs(plateauDifference) >= materialDifference && Math.abs(groupMeans[2] - groupMeans[1]) <= Math.max(materialDifference, Math.abs(plateauDifference) * .5),
    label: `plateau after ${predictorValue(lowerBoundary, series)}`,
    modelType: "plateau",
    low: lowerBoundary,
    high: Math.max(...predictors),
  });
  const middleDiffers = Math.sign(groupMeans[1] - groupMeans[0]) === Math.sign(groupMeans[1] - groupMeans[2])
    && Math.min(Math.abs(groupMeans[1] - groupMeans[0]), Math.abs(groupMeans[1] - groupMeans[2])) >= materialDifference;
  const middleBetter = desirability(groupMeans[1], options) > desirability((groupMeans[0] + groupMeans[2]) / 2, options);
  const zoneType: "optimal-zone" | "adverse-zone" | "middle-zone" = options.outcomeDirection ? (middleBetter ? "optimal-zone" : "adverse-zone") : "middle-zone";
  candidates.push({
    indicator: groupIndexes.map((group) => group === 1 ? 1 : 0),
    valid: middleDiffers,
    label: `${zoneType.replace("-", " ")} ${predictorValue(lowerBoundary, series)}–${predictorValue(upperBoundary, series)}`,
    modelType: zoneType,
    low: lowerBoundary,
    high: upperBoundary,
  });

  const estimates = candidates.flatMap((candidate): Estimate[] => {
    if (!candidate.valid) return [];
    const centeredIndicator = centerWithinSources(candidate.indicator, pairs);
    const denominator = centeredIndicator.reduce((sum, value) => sum + value * value, 0);
    if (denominator < 1e-10) return [];
    const effect = centeredIndicator.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
    const residualSse = centeredOutcomes.reduce((sum, value, index) => sum + (value - effect * centeredIndicator[index]) ** 2, 0);
    const improvement = Math.max(0, 1 - residualSse / linearSse);
    if (improvement < MINIMUM_NONLINEAR_IMPROVEMENT) return [];
    const estimate = fitIndicatorEstimate({
      pairs,
      indicator: candidate.indicator,
      outcomeSpread,
      predictorLow: candidate.low,
      predictorHigh: candidate.high,
      comparisonLabel: candidate.label,
      modelType: candidate.modelType,
      modelImprovement: improvement,
    });
    return estimate ? [estimate] : [];
  });
  return estimates.sort((first, second) => second.modelImprovement - first.modelImprovement)[0] ?? null;
}

function fitEstimate(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions): Estimate | null {
  if (pairs.length < MINIMUM_DAILY_OBSERVATIONS || standardDeviation(pairs.map((pair) => pair.outcome)) < 1e-10) return null;
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
      modelType: "binary",
      modelImprovement: 0,
      habitualPredictorDelta: null,
      habitualEffect: null,
    };
  }
  const nonlinear = fitNonlinearEstimate(pairs, series, options);
  if (nonlinear) return nonlinear;
  return fitLinearEstimate(pairs, series);
}

function fitLinearEstimate(pairs: Pair[], series: MatrixSeries): Estimate | null {
  if (pairs.length < MINIMUM_DAILY_OBSERVATIONS || standardDeviation(pairs.map((pair) => pair.outcome)) < 1e-10) return null;
  const values = pairs.map((pair) => pair.predictor);
  const robustPredictors = protectAgainstExtremeImportErrors(values);
  const robustOutcomes = protectAgainstExtremeImportErrors(pairs.map((pair) => pair.outcome));
  const predictorMean = mean(robustPredictors);
  const centered = centerWithinSources(robustPredictors, pairs);
  const denominator = centered.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return null;
  const outcomeMean = mean(robustOutcomes);
  const centeredOutcomes = centerWithinSources(robustOutcomes, pairs);
  const slope = centered.reduce((sum, value, index) => sum + value * centeredOutcomes[index], 0) / denominator;
  const observedSpread = Math.max(quantile(values, .75) - quantile(values, .25), 1e-9);
  const contrast = series.presentation === "clock-time" ? 30 : niceContrast(observedSpread);
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
    modelType: "linear",
    modelImprovement: 0,
    habitualPredictorDelta: observedSpread,
    habitualEffect: slope * observedSpread,
  };
}

function calculateDoseResponse(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions, outcomeUnit: string): MatrixDoseResponse | null {
  if (series.kind !== "numeric" || series.presentation !== "amount") return null;
  const zeros = pairs.filter((pair) => pair.predictor === 0);
  const positives = pairs.filter((pair) => pair.predictor > 0);
  if (zeros.length < MINIMUM_BINARY_GROUP || positives.length < MINIMUM_BINARY_GROUP || standardDeviation(pairs.map((pair) => pair.predictor)) < 1e-10) return null;
  const estimate = fitNonlinearEstimate(pairs, series, options) ?? fitLinearEstimate(pairs, series);
  if (!estimate) return null;
  const confidenceLow = estimate.effect - 1.959963984540054 * estimate.standardError;
  const confidenceHigh = estimate.effect + 1.959963984540054 * estimate.standardError;
  return {
    comparisonLabel: `${estimate.comparisonLabel} across all recorded days`,
    effect: round(estimate.effect, 1),
    effectConfidenceLow: round(confidenceLow, 1),
    effectConfidenceHigh: round(confidenceHigh, 1),
    percentEffect: relativePercent(estimate.effect, estimate.baselineMean, outcomeUnit),
    baselineMean: round(estimate.baselineMean, 2),
    comparisonMean: round(estimate.comparisonMean, 2),
    sampleSize: pairs.length,
    pValue: estimate.pValue,
    modelType: estimate.modelType === "binary" ? "linear" : estimate.modelType,
    modelImprovement: round(estimate.modelImprovement, 3),
    nonlinearTested: nonlinearTestEligible(pairs, series),
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
  if (relation.coefficient === null) return { ...relation, qValue: 1, practicallyMeaningful: false, practicalRatio: 0, featureEligible: false };
  const significant = qValue < .05;
  const practicalRatio = relation.practicalRatio;
  return {
    ...relation, qValue, practicalRatio: round(practicalRatio, 3), practicallyMeaningful: significant && practicalRatio >= 1,
    featureEligible: significant, stable: significant,
    evidence: significant ? "established" : "exploratory",
    strength: significant ? (Math.abs(relation.percentEffect ?? 0) >= 10 ? "strong" : "clear") : "light",
    relevance: significant ? Math.abs(relation.percentEffect ?? relation.coefficient ?? 0) * -Math.log10(Math.max(qValue, 1e-8)) * Math.log10(relation.sampleSize + 1) : 0,
    exclusionReasons: significant ? relation.exclusionReasons : [...new Set([...relation.exclusionReasons, "BH-adjusted q value is not below 0.05"])],
  };
}

export const PRACTICAL_EFFECT_THRESHOLDS: Readonly<Record<string, number>> = {
  sleep_minutes: 15,
  sleep_efficiency: 1.5,
  sleep_latency: 5,
  sleep_awake: 5,
  sleep_awakenings: 1,
  deep_sleep: 5,
  rem_sleep: 5,
  hrv: 2,
  rhr: 1,
  respiratory: .3,
  spo2: .3,
  recovery: 3,
};

export function selectMeaningfulRelations(relations: MatrixRelation[], limit = 8) {
  const eligibleByPair = new Map<string, MatrixRelation[]>();
  const stronger = (first: MatrixRelation, second: MatrixRelation) =>
    second.practicalRatio - first.practicalRatio
    || first.qValue - second.qValue
    || second.sampleSize - first.sampleSize;
  for (const relation of relations) {
    if (relation.excluded || relation.qValue >= .05 || !relation.practicallyMeaningful) continue;
    const key = `${relation.period}:${relation.predictorId}:${relation.outcomeId}`;
    eligibleByPair.set(key, [...(eligibleByPair.get(key) ?? []), relation]);
  }
  const selected = [...eligibleByPair.values()].map((candidates) => {
    const nextDay = candidates.filter((relation) => relation.lagDays === 1).sort(stronger)[0];
    if (!nextDay) return [...candidates].sort(stronger)[0];
    const twoDaysLater = candidates.filter((relation) => relation.lagDays === 2).sort(stronger)[0];
    return twoDaysLater && twoDaysLater.practicalRatio >= nextDay.practicalRatio * J2_HIGHLIGHT_ADVANTAGE ? twoDaysLater : nextDay;
  });
  return selected.sort(stronger).slice(0, limit);
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
  const doseResponse = calculateDoseResponse(pairs, predictor, options, outcome.unit);
  const stability = chronologicalDirection(pairs);
  const minimum = predictor.kind === "binary" ? `${MINIMUM_BINARY_GROUP} yes and ${MINIMUM_BINARY_GROUP} no days` : `${MINIMUM_DAILY_OBSERVATIONS} paired days`;
  const exclusionReasons = estimate ? [] : [`At least ${minimum} are required`];
  if (estimate && Math.abs(estimate.effect) < (options.minimumMeaningfulEffect ?? 0)) exclusionReasons.push("Effect is below the practical display threshold");
  const confidenceLow = estimate ? estimate.effect - 1.959963984540054 * estimate.standardError : null;
  const confidenceHigh = estimate ? estimate.effect + 1.959963984540054 * estimate.standardError : null;
  const outcomeScale = standardDeviation(pairs.map((pair) => pair.outcome)) || 1;
  const sourceName = coverageBySource.map((item) => item.source).join(" + ") || "All data";
  const explicitPracticalThreshold = PRACTICAL_EFFECT_THRESHOLDS[outcome.id];
  const practicalThreshold = explicitPracticalThreshold ?? .2;
  const practicalRatio = estimate
    ? explicitPracticalThreshold === undefined ? Math.abs(estimate.effect) / outcomeScale / practicalThreshold : Math.abs(estimate.effect) / practicalThreshold
    : 0;
  const relation: MatrixRelation = {
    predictorId: predictor.id, predictorLabel: predictor.label, predictorUnit: predictor.unit, predictorKind: predictor.kind,
    predictorPresentation: predictor.presentation ?? "amount",
    predictorLow: estimate ? round(estimate.predictorLow, 2) : null, predictorHigh: estimate ? round(estimate.predictorHigh, 2) : null, predictorDelta: estimate ? round(estimate.predictorDelta, 2) : null,
    outcomeId: outcome.id, outcomeLabel: outcome.label, outcomeUnit: outcome.unit,
    coefficient: estimate ? round(estimate.coefficient, 3) : null, effect: estimate ? round(estimate.effect, 1) : null,
    effectConfidenceLow: confidenceLow === null ? null : round(confidenceLow, 1), effectConfidenceHigh: confidenceHigh === null ? null : round(confidenceHigh, 1),
    percentEffect: estimate ? relativePercent(estimate.effect, estimate.baselineMean, outcome.unit) : null,
    baselineMean: estimate ? round(estimate.baselineMean, 2) : null, comparisonMean: estimate ? round(estimate.comparisonMean, 2) : null,
    baselineCount: estimate?.baselineCount ?? 0, comparisonCount: estimate?.comparisonCount ?? 0, comparisonLabel: estimate?.comparisonLabel ?? "not enough data",
    modelType: estimate?.modelType ?? (predictor.kind === "binary" ? "binary" : "linear"), modelImprovement: round(estimate?.modelImprovement ?? 0, 3),
    nonlinearTested: estimate?.modelType !== "binary" && nonlinearTestEligible(pairs, predictor),
    sampleSize: pairs.length, effectiveSampleSize: pairs.length, pValue: estimate?.pValue ?? 1, qValue: estimate?.pValue ?? 1,
    confidenceLow: confidenceLow === null ? -1 : confidenceLow / outcomeScale, confidenceHigh: confidenceHigh === null ? 1 : confidenceHigh / outcomeScale,
    relevance: 0, lagDays, grain, timeScale, period, family, method: "raw-within-person-hac",
    evidence: estimate ? "exploratory" : "insufficient", stable: false,
    stability: { chronologicalBlocks: stability.blocks, directionHeldInBlocks: stability.held, trendAdjustedDirectionHeld: true, outlierAdjustedDirectionHeld: true },
    strength: estimate ? "light" : "hidden", coverageBySource,
    sourceEstimates: estimate ? [{ source: sourceName, sampleSize: pairs.length, effect: round(estimate.effect, 1), effectConfidenceLow: round(confidenceLow ?? estimate.effect, 1), effectConfidenceHigh: round(confidenceHigh ?? estimate.effect, 1), coefficient: round(estimate.coefficient, 3), pValue: estimate.pValue }] : [],
    doseResponse,
    habitualPredictorDelta: estimate?.habitualPredictorDelta === null || estimate?.habitualPredictorDelta === undefined ? null : round(estimate.habitualPredictorDelta, 2),
    habitualEffect: estimate?.habitualEffect === null || estimate?.habitualEffect === undefined ? null : round(estimate.habitualEffect, 1),
    practicallyMeaningful: false, practicalThreshold, practicalRatio: round(practicalRatio, 3),
    featureEligible: false, exclusionReasons, excluded: false,
  };
  return finalizeRelation(relation, relation.pValue);
}

export function calculateCorrelationMatrix(predictors: MatrixSeries[], outcomes: MatrixSeries[], lagDays = 0) {
  return adjustMatrixRelations(predictors.flatMap((predictor) => outcomes.filter((outcome) => outcome.id !== predictor.id).map((outcome) => calculateMatrixRelation(predictor, outcome, lagDays))));
}
