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
const NORMAL_95_CRITICAL_VALUE = 1.959963984540054;
const NONLINEAR_95_CRITICAL_VALUE = 2.3939797998185104;
const EXTREME_IMPORT_FENCE_MULTIPLIER = 6;
const J2_HIGHLIGHT_EFFECT_ADVANTAGE = 1.2;
const J2_HIGHLIGHT_Q_ADVANTAGE = .6;

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
  /** Four calendar-block effects rounded to at most three decimals, using the full-window contrast. */
  blockEffects?: Array<number | null>;
  blockSampleSizes?: number[];
  magnitudeHeldInBlocks?: boolean;
  adequateBlockCoverage?: boolean;
  trendMagnitudeHeld?: boolean;
  outlierMagnitudeHeld?: boolean;
  outlierModelHeld?: boolean;
  stabilityReasons?: string[];
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
  method: "within-person-calendar-hac";
  evidence: "insufficient" | "exploratory" | "promising" | "established";
  stable: boolean; stability: MatrixStability; strength: "hidden" | "light" | "clear" | "strong";
  coverageBySource: MatrixSourceCoverage[]; sourceEstimates: MatrixSourceEstimate[];
  doseResponse: MatrixDoseResponse | null;
  habitualPredictorDelta: number | null; habitualEffect: number | null;
  minimumDaysRemaining?: number;
  practicallyMeaningful: boolean; practicalThreshold: number; practicalRatio: number;
  featureEligible: boolean; exclusionReasons: string[]; excluded: boolean;
};

/** Stable identity across a fresh server calculation and the displayed snapshot. */
export function summaryRelationKey(relation: Pick<MatrixRelation, "predictorId" | "outcomeId" | "lagDays" | "grain" | "timeScale" | "modelType" | "comparisonLabel">): string {
  return JSON.stringify([relation.predictorId, relation.outcomeId, relation.lagDays, relation.grain, relation.timeScale, relation.modelType, relation.comparisonLabel]);
}
export type MatrixRelationOptions = {
  grain?: "day" | "week";
  timeScale?: "acute" | "chronic";
  family?: MatrixRelation["family"];
  minimumMeaningfulEffect?: number;
  period?: AnalysisPeriod;
  analysisEndDate?: string;
  outcomeDirection?: "higher" | "lower" | "target";
  outcomeTarget?: number;
};

/** Metrics that are retained in health storage but intentionally absent from Personal Lab analysis. */
export const PERSONAL_LAB_EXCLUDED_METRIC_IDS = new Set(["sleep_awakenings"]);

export function isPersonalLabMetricAllowed(metricId: string) {
  return !PERSONAL_LAB_EXCLUDED_METRIC_IDS.has(metricId);
}

/** Canonical publication gate for Personal Lab highlights, narratives, and graphs. */
export type PersonalLabRelationDisplayOptions = {
  requireTemporalStability?: boolean;
};

export function isPersonalLabDisplayableRelation(
  relation: Pick<MatrixRelation, "predictorId" | "outcomeId" | "excluded" | "featureEligible" | "qValue" | "practicallyMeaningful" | "stable">,
  options: PersonalLabRelationDisplayOptions = {},
) {
  return isPersonalLabMetricAllowed(relation.predictorId)
    && isPersonalLabMetricAllowed(relation.outcomeId)
    && !relation.excluded
    && relation.featureEligible
    && relation.qValue < .05
    && relation.practicallyMeaningful
    && (options.requireTemporalStability === false || relation.stable);
}

export function isPersonalLabPublishedRelation(relation: Pick<MatrixRelation, "predictorId" | "outcomeId" | "excluded" | "featureEligible" | "qValue" | "practicallyMeaningful" | "stable">) {
  return isPersonalLabDisplayableRelation(relation);
}

/** @deprecated Use isPersonalLabPublishedRelation for anything that is rendered as a finding. */
export const isPersonalLabFeatureEligible = isPersonalLabPublishedRelation;

type Pair = { date: string; day: number; predictor: number; outcome: number; segment: string };
type Estimate = {
  effect: number; standardError: number; pValue: number; coefficient: number;
  predictorLow: number; predictorHigh: number; predictorDelta: number;
  baselineMean: number; comparisonMean: number; baselineCount: number; comparisonCount: number; comparisonLabel: string;
  modelType: MatrixModelType; modelImprovement: number;
  habitualPredictorDelta: number | null; habitualEffect: number | null;
  inferencePredictor: number[]; inferenceOutcome: number[]; inferenceContrast: number;
};

function estimateConfidenceBounds(estimate: Estimate) {
  // The non-linear p value checks three shapes, so its interval uses the same Bonferroni family.
  const criticalValue = estimate.modelType === "linear" || estimate.modelType === "binary"
    ? NORMAL_95_CRITICAL_VALUE
    : NONLINEAR_95_CRITICAL_VALUE;
  return {
    low: estimate.effect - criticalValue * estimate.standardError,
    high: estimate.effect + criticalValue * estimate.standardError,
  };
}

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
    return [{ date: point.date, day: dateOrdinal(point.date), predictor: point.value, outcome: outcomePoint.value, segment: point.segment ?? outcomePoint.segment ?? "All data" }];
  }).sort((first, second) => first.date.localeCompare(second.date));
}

function coverage(pairs: Pair[], grain: "day" | "week") {
  const grouped = new Map<string, number>();
  for (const pair of pairs) grouped.set(pair.segment, (grouped.get(pair.segment) ?? 0) + 1);
  return [...grouped].map(([source, count]) => ({ source, pairedDays: grain === "day" ? count : 0, pairedWeeks: grain === "week" ? count : 0 }));
}

function dateOrdinal(date: string) {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
}

/** Bartlett/Newey-West covariance indexed by calendar days, so missing rows do not shorten lags. */
function hacStandardError(pairs: Pair[], centeredPredictor: number[], residuals: number[]) {
  const denominator = centeredPredictor.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return 0;
  const scores = centeredPredictor.map((value, index) => value * residuals[index]);
  const byDateAndSegment = new Map<string, { segment: string; day: number; score: number }>();
  pairs.forEach((pair, index) => {
    const key = `${pair.segment}\u0000${pair.day}`;
    const group = byDateAndSegment.get(key);
    if (group) group.score += scores[index];
    else byDateAndSegment.set(key, { segment: pair.segment, day: pair.day, score: scores[index] });
  });
  const maximumLag = Math.min(7, Math.floor(byDateAndSegment.size / 4));
  let meat = [...byDateAndSegment.values()].reduce((sum, group) => sum + group.score * group.score, 0);
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    const weight = 1 - lag / (maximumLag + 1);
    let covariance = 0;
    for (const group of byDateAndSegment.values()) {
      const earlier = byDateAndSegment.get(`${group.segment}\u0000${group.day - lag}`);
      if (earlier) covariance += group.score * earlier.score;
    }
    meat += 2 * weight * covariance;
  }
  return Math.sqrt(Math.max(0, meat / (denominator * denominator)));
}

type DesignFit = { slope: number; effect: number; standardError: number; pValue: number };

/** Fits one fixed effect contrast, optionally controlling for source and linear calendar time. */
function fitDesign(
  pairs: Pair[],
  predictor: number[],
  outcome: number[],
  contrast: number,
  adjustForCalendarTrend = false,
  calculateInference = true,
): DesignFit | null {
  let centeredPredictor = centerWithinSources(predictor, pairs);
  let centeredOutcome = centerWithinSources(outcome, pairs);
  if (adjustForCalendarTrend) {
    const firstDay = pairs.length ? pairs[0].day : 0;
    const centeredTime = centerWithinSources(pairs.map((pair) => pair.day - firstDay), pairs);
    const timeDenominator = centeredTime.reduce((sum, value) => sum + value * value, 0);
    if (timeDenominator < 1e-10) return null;
    const timePredictorSlope = centeredTime.reduce((sum, value, index) => sum + value * centeredPredictor[index], 0) / timeDenominator;
    const timeOutcomeSlope = centeredTime.reduce((sum, value, index) => sum + value * centeredOutcome[index], 0) / timeDenominator;
    centeredPredictor = centeredPredictor.map((value, index) => value - timePredictorSlope * centeredTime[index]);
    centeredOutcome = centeredOutcome.map((value, index) => value - timeOutcomeSlope * centeredTime[index]);
  }
  const denominator = centeredPredictor.reduce((sum, value) => sum + value * value, 0);
  if (denominator < 1e-10) return null;
  const slope = centeredPredictor.reduce((sum, value, index) => sum + value * centeredOutcome[index], 0) / denominator;
  const residuals = centeredOutcome.map((value, index) => value - slope * centeredPredictor[index]);
  const effect = slope * contrast;
  const standardError = calculateInference
    ? hacStandardError(pairs, centeredPredictor, residuals) * Math.abs(contrast)
    : 0;
  const pValue = !calculateInference ? 1 : standardError < 1e-12
    ? (Math.abs(effect) < 1e-12 ? 1 : 0)
    : normalPValue(effect / standardError);
  return { slope, effect, standardError, pValue };
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
  calculateInference?: boolean;
}): Estimate | null {
  const outcomes = input.pairs.map((pair) => pair.outcome);
  const fit = fitDesign(input.pairs, input.indicator, outcomes, 1, false, input.calculateInference ?? true);
  if (!fit) return null;
  const { effect, standardError } = fit;
  const baselineMean = mean(outcomes) - effect * mean(input.indicator);
  return {
    effect,
    standardError,
    pValue: Math.min(1, SEARCHED_NONLINEAR_SHAPES * fit.pValue),
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
    inferencePredictor: input.indicator,
    inferenceOutcome: outcomes,
    inferenceContrast: 1,
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

function fitNonlinearEstimate(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions, calculateInference = true): Estimate | null {
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
      calculateInference,
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
    const outcomes = pairs.map((pair) => pair.outcome);
    const fit = fitDesign(pairs, x, outcomes, 1);
    if (!fit) return null;
    const { effect, standardError } = fit;
    const baselineMean = mean(pairs.map((pair) => pair.outcome)) - effect * mean(x);
    const comparisonMean = baselineMean + effect;
    const averagePositive = series.kind === "binary" ? 1 : mean(positives.map((pair) => pair.predictor));
    return {
      effect, standardError,
      pValue: fit.pValue,
      coefficient: effect / (standardDeviation(pairs.map((pair) => pair.outcome)) || 1),
      predictorLow: 0, predictorHigh: averagePositive, predictorDelta: averagePositive,
      baselineMean, comparisonMean, baselineCount: baseline.length, comparisonCount: comparison.length,
      comparisonLabel: series.kind === "binary" ? "yes vs no" : `${round(averagePositive, 1)} ${series.unit} avg vs 0`,
      modelType: "binary",
      modelImprovement: 0,
      habitualPredictorDelta: null,
      habitualEffect: null,
      inferencePredictor: x,
      inferenceOutcome: outcomes,
      inferenceContrast: 1,
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
  const outcomeMean = mean(robustOutcomes);
  const observedSpread = Math.max(quantile(values, .75) - quantile(values, .25), 1e-9);
  const contrast = series.presentation === "clock-time" ? 30 : niceContrast(observedSpread);
  const low = series.presentation === "clock-time" ? predictorMean : quantile(values, .25);
  const high = low + contrast;
  const fit = fitDesign(pairs, robustPredictors, robustOutcomes, contrast);
  if (!fit) return null;
  const { slope, effect, standardError, pValue } = fit;
  const coefficient = slope * standardDeviation(robustPredictors) / (standardDeviation(robustOutcomes) || 1);
  return {
    effect, standardError,
    pValue,
    coefficient,
    predictorLow: low, predictorHigh: high, predictorDelta: contrast,
    baselineMean: outcomeMean + slope * (low - predictorMean),
    comparisonMean: outcomeMean + slope * (high - predictorMean),
    baselineCount: pairs.length, comparisonCount: pairs.length,
    comparisonLabel: series.presentation === "clock-time" ? "30 min later" : `+${round(contrast, contrast >= 10 ? 0 : 1)}${series.unit ? ` ${series.unit}` : ""}`,
    modelType: "linear",
    modelImprovement: 0,
    habitualPredictorDelta: observedSpread,
    habitualEffect: slope * observedSpread,
    inferencePredictor: robustPredictors,
    inferenceOutcome: robustOutcomes,
    inferenceContrast: contrast,
  };
}

function calculateDoseResponse(pairs: Pair[], series: MatrixSeries, options: MatrixRelationOptions, outcomeUnit: string, relationEstimate: Estimate | null): MatrixDoseResponse | null {
  if (series.kind !== "numeric" || series.presentation !== "amount") return null;
  const zeros = pairs.filter((pair) => pair.predictor === 0);
  const positives = pairs.filter((pair) => pair.predictor > 0);
  if (zeros.length < MINIMUM_BINARY_GROUP || positives.length < MINIMUM_BINARY_GROUP || standardDeviation(pairs.map((pair) => pair.predictor)) < 1e-10) return null;
  const estimate = relationEstimate && relationEstimate.modelType !== "binary"
    ? relationEstimate
    : fitNonlinearEstimate(pairs, series, options) ?? fitLinearEstimate(pairs, series);
  if (!estimate) return null;
  const { low: confidenceLow, high: confidenceHigh } = estimateConfidenceBounds(estimate);
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

const CHRONOLOGICAL_BLOCK_COUNT = 4;
// Prespecified screening rules; the stored daily history allows later calibration against observed churn.
const MINIMUM_STABILITY_BLOCK_OBSERVATIONS = 8;
const MINIMUM_STABLE_DIRECTION_BLOCKS = 3;
const MAXIMUM_STABLE_BLOCK_EFFECT_DEVIATION = .75;

function stabilityForEstimate(
  pairs: Pair[],
  predictor: MatrixSeries,
  options: MatrixRelationOptions,
  estimate: Estimate | null,
  practicalThreshold: number,
  lagDays: number,
): MatrixStability {
  const stabilityReasons: string[] = [];
  const nullEffects = Array<number | null>(CHRONOLOGICAL_BLOCK_COUNT).fill(null);
  // A relation cannot pass the publication gate when its own p value or effect is below threshold.
  // Skip the more expensive robustness fits for those relations.
  if (!estimate || pairs.length === 0 || estimate.pValue >= .05 || Math.abs(estimate.effect) < practicalThreshold) {
    return {
      chronologicalBlocks: 0,
      directionHeldInBlocks: false,
      trendAdjustedDirectionHeld: false,
      outlierAdjustedDirectionHeld: false,
      blockEffects: nullEffects,
      blockSampleSizes: Array.from({ length: CHRONOLOGICAL_BLOCK_COUNT }, () => 0),
      magnitudeHeldInBlocks: false,
      adequateBlockCoverage: false,
      trendMagnitudeHeld: false,
      outlierMagnitudeHeld: false,
      outlierModelHeld: false,
      stabilityReasons: estimate ? [] : ["A relation could not be estimated for temporal stability checks"],
    };
  }

  const lastDay = options.analysisEndDate
    ? dateOrdinal(options.analysisEndDate) - lagDays
    : pairs[pairs.length - 1].day;
  const period = options.period ?? "all";
  const firstObservedDay = pairs[0].day;
  const firstDay = period === "all" ? firstObservedDay : lastDay - Math.max(1, period - lagDays) + 1;
  const span = Math.max(1, lastDay - firstDay + 1);
  const pairIndexesByBlock: number[][] = Array.from({ length: CHRONOLOGICAL_BLOCK_COUNT }, () => []);
  pairs.forEach((pair, index) => {
    const block = Math.min(CHRONOLOGICAL_BLOCK_COUNT - 1, Math.floor((pair.day - firstDay) * CHRONOLOGICAL_BLOCK_COUNT / span));
    pairIndexesByBlock[block].push(index);
  });

  // Shorter views need smaller blocks; the 90-day view requires at least eight pairs per quarter.
  const periodMinimum = period === 15 ? 2 : period === 30 ? 4 : MINIMUM_STABILITY_BLOCK_OBSERVATIONS;
  const minimumBlockObservations = Math.max(periodMinimum, Math.ceil(pairs.length / (CHRONOLOGICAL_BLOCK_COUNT * 2)));
  const adequateBlockCoverage = pairIndexesByBlock.every((indexes) => indexes.length >= minimumBlockObservations);
  if (!adequateBlockCoverage) stabilityReasons.push(`At least ${minimumBlockObservations} paired days are required in each of four calendar blocks`);

  const rawBlockEffects = pairIndexesByBlock.map((indexes) => {
    if (indexes.length < 2) return null;
    const subsetPairs = indexes.map((index) => pairs[index]);
    const fit = fitDesign(
      subsetPairs,
      indexes.map((index) => estimate.inferencePredictor[index]),
      indexes.map((index) => estimate.inferenceOutcome[index]),
      estimate.inferenceContrast,
      false,
      false,
    );
    return fit?.effect ?? null;
  });
  const blockEffects = rawBlockEffects.map((effect) => effect === null ? null : round(effect, 3));
  const fullDirection = Math.sign(estimate.effect);
  const matchingDirectionBlocks = rawBlockEffects.filter((effect) => effect !== null && Math.sign(effect) === fullDirection).length;
  const opposingDirectionBlock = rawBlockEffects.some((effect) => effect !== null && Math.sign(effect) === -fullDirection);
  const directionHeldInBlocks = adequateBlockCoverage
    && fullDirection !== 0
    && matchingDirectionBlocks >= MINIMUM_STABLE_DIRECTION_BLOCKS
    && !opposingDirectionBlock;
  if (!directionHeldInBlocks) stabilityReasons.push(opposingDirectionBlock
    ? "The effect direction reversed in a calendar block"
    : "The effect direction did not repeat in at least three of four calendar blocks");

  const magnitudeTolerance = Math.max(practicalThreshold, Math.abs(estimate.effect) * MAXIMUM_STABLE_BLOCK_EFFECT_DEVIATION);
  const magnitudeHeldBlocks = rawBlockEffects.filter((effect) => effect !== null
    && Math.sign(effect) === fullDirection
    && Math.abs(effect) >= Math.abs(estimate.effect) * (1 - MAXIMUM_STABLE_BLOCK_EFFECT_DEVIATION)
    && Math.abs(effect - estimate.effect) <= magnitudeTolerance).length;
  const magnitudeHeldInBlocks = adequateBlockCoverage
    && fullDirection !== 0
    && magnitudeHeldBlocks >= MINIMUM_STABLE_DIRECTION_BLOCKS;
  if (!magnitudeHeldInBlocks) stabilityReasons.push("The effect size varied substantially across calendar blocks");

  const trendFit = fitDesign(pairs, estimate.inferencePredictor, estimate.inferenceOutcome, estimate.inferenceContrast, true, false);
  const trendAdjustedDirectionHeld = Boolean(trendFit && fullDirection !== 0 && Math.sign(trendFit.effect) === fullDirection);
  const trendMagnitudeHeld = Boolean(trendFit && trendAdjustedDirectionHeld
    && Math.abs(trendFit.effect) >= Math.abs(estimate.effect) * (1 - MAXIMUM_STABLE_BLOCK_EFFECT_DEVIATION)
    && Math.abs(trendFit.effect - estimate.effect) <= magnitudeTolerance);
  if (!trendFit) stabilityReasons.push("The trend-adjusted estimate could not be calculated");
  else if (!trendAdjustedDirectionHeld) stabilityReasons.push("The effect direction changed after adjusting for calendar trend");
  else if (!trendMagnitudeHeld) stabilityReasons.push("The effect size changed substantially after adjusting for calendar trend");

  let outlierFit: DesignFit | null = null;
  let outlierModelType = estimate.modelType;
  if (estimate.modelType === "linear") {
    // The published linear fit is winsorized; check whether the same contrast holds on original values.
    outlierFit = fitDesign(
      pairs,
      pairs.map((pair) => pair.predictor),
      pairs.map((pair) => pair.outcome),
      estimate.inferenceContrast,
      false,
    );
  } else if (estimate.modelType === "binary") {
    // Binary exposure is a category; protect only the outcome from possible import spikes.
    outlierFit = fitDesign(
      pairs,
      estimate.inferencePredictor,
      protectAgainstExtremeImportErrors(pairs.map((pair) => pair.outcome)),
      estimate.inferenceContrast,
      false,
    );
  } else {
    // Re-select a non-linear shape after protecting continuous inputs to expose cutoff sensitivity.
    const protectedPredictors = protectAgainstExtremeImportErrors(pairs.map((pair) => pair.predictor));
    const protectedOutcomes = protectAgainstExtremeImportErrors(pairs.map((pair) => pair.outcome));
    const protectedPairs = pairs.map((pair, index) => ({
      ...pair,
      predictor: protectedPredictors[index],
      outcome: protectedOutcomes[index],
    }));
    const protectedEstimate = fitNonlinearEstimate(protectedPairs, predictor, options, false);
    outlierFit = protectedEstimate ? {
      slope: protectedEstimate.effect,
      effect: protectedEstimate.effect,
      standardError: protectedEstimate.standardError,
      pValue: protectedEstimate.pValue,
    } : null;
    outlierModelType = protectedEstimate?.modelType ?? estimate.modelType;
  }
  const outlierAdjustedDirectionHeld = Boolean(outlierFit && fullDirection !== 0 && Math.sign(outlierFit.effect) === fullDirection);
  const outlierMagnitudeHeld = Boolean(outlierFit && outlierAdjustedDirectionHeld
    && Math.abs(outlierFit.effect) >= Math.abs(estimate.effect) * (1 - MAXIMUM_STABLE_BLOCK_EFFECT_DEVIATION)
    && Math.abs(outlierFit.effect - estimate.effect) <= magnitudeTolerance);
  const outlierModelHeld = estimate.modelType === "linear" || estimate.modelType === "binary" || outlierModelType === estimate.modelType;
  if (!outlierFit) stabilityReasons.push("The outlier-adjusted estimate could not be calculated");
  else if (!outlierAdjustedDirectionHeld) stabilityReasons.push("The effect direction changed after checking extreme values");
  else if (!outlierMagnitudeHeld) stabilityReasons.push("The effect size changed substantially after checking extreme values");
  if (!outlierModelHeld) {
    stabilityReasons.push("The selected non-linear shape changed after checking extreme values");
  }

  return {
    chronologicalBlocks: matchingDirectionBlocks,
    directionHeldInBlocks,
    trendAdjustedDirectionHeld,
    outlierAdjustedDirectionHeld,
    blockEffects,
    blockSampleSizes: pairIndexesByBlock.map((indexes) => indexes.length),
    magnitudeHeldInBlocks,
    adequateBlockCoverage,
    trendMagnitudeHeld,
    outlierMagnitudeHeld,
    outlierModelHeld,
    stabilityReasons,
  };
}

function finalizeRelation(relation: MatrixRelation, qValue: number): MatrixRelation {
  if (relation.coefficient === null) return { ...relation, qValue: 1, practicallyMeaningful: false, practicalRatio: 0, featureEligible: false };
  const significant = qValue < .05;
  const practicalRatio = relation.practicalRatio;
  const stable = significant
    && practicalRatio >= 1
    && relation.stability.directionHeldInBlocks
    && relation.stability.magnitudeHeldInBlocks === true
    && relation.stability.adequateBlockCoverage === true
    && relation.stability.trendAdjustedDirectionHeld
    && relation.stability.trendMagnitudeHeld === true
    && relation.stability.outlierAdjustedDirectionHeld
    && relation.stability.outlierMagnitudeHeld === true
    && relation.stability.outlierModelHeld === true;
  const exclusionReasons = [...relation.exclusionReasons, ...(relation.stability.stabilityReasons ?? [])];
  return {
    ...relation, qValue, practicalRatio: round(practicalRatio, 3), practicallyMeaningful: significant && practicalRatio >= 1,
    featureEligible: significant, stable,
    evidence: significant ? (stable ? "established" : "promising") : "exploratory",
    strength: significant ? (Math.abs(relation.percentEffect ?? 0) >= 10 ? "strong" : "clear") : "light",
    relevance: significant ? Math.abs(relation.percentEffect ?? relation.coefficient ?? 0) * -Math.log10(Math.max(qValue, 1e-8)) * Math.log10(relation.sampleSize + 1) : 0,
    exclusionReasons: [...new Set(significant ? exclusionReasons : [...exclusionReasons, "BH-adjusted q value is not below 0.05"])],
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

type MeaningfulRelation = Parameters<typeof isPersonalLabDisplayableRelation>[0]
  & Pick<MatrixRelation, "period" | "practicalRatio" | "sampleSize" | "lagDays">;

export function selectMeaningfulRelations<T extends MeaningfulRelation>(relations: T[], limit = 8, options: PersonalLabRelationDisplayOptions = {}) {
  const eligibleByPair = new Map<string, T[]>();
  const stronger = (first: T, second: T) =>
    second.practicalRatio - first.practicalRatio
    || first.qValue - second.qValue
    || second.sampleSize - first.sampleSize;
  for (const relation of relations) {
    if (!isPersonalLabDisplayableRelation(relation, options)) continue;
    const key = `${relation.period}:${relation.predictorId}:${relation.outcomeId}`;
    eligibleByPair.set(key, [...(eligibleByPair.get(key) ?? []), relation]);
  }
  const selected = [...eligibleByPair.values()].map((candidates) => {
    const nextDay = candidates.filter((relation) => relation.lagDays === 1).sort(stronger)[0];
    if (!nextDay) return [...candidates].sort(stronger)[0];
    const twoDaysLater = candidates.filter((relation) => relation.lagDays === 2).sort(stronger)[0];
    return twoDaysLater
      && twoDaysLater.practicalRatio >= nextDay.practicalRatio * J2_HIGHLIGHT_EFFECT_ADVANTAGE
      && twoDaysLater.qValue <= nextDay.qValue * J2_HIGHLIGHT_Q_ADVANTAGE
      ? twoDaysLater
      : nextDay;
  });
  return selected.sort(stronger).slice(0, limit);
}

/** Keep the strongest result, then show different outcomes when the evidence allows it. */
export function selectSummaryRelations<T extends MeaningfulRelation>(relations: T[], options: PersonalLabRelationDisplayOptions = {}) {
  const candidates = selectMeaningfulRelations(relations, 24, options);
  const selected = candidates.slice(0, 1);
  const outcomes = new Set(selected.map((relation) => relation.outcomeId));
  for (const relation of candidates.slice(1)) {
    if (selected.length === 4) break;
    if (outcomes.has(relation.outcomeId)) continue;
    selected.push(relation);
    outcomes.add(relation.outcomeId);
  }
  for (const relation of candidates.slice(1)) {
    if (selected.length === 4) break;
    if (!selected.includes(relation)) selected.push(relation);
  }
  return selected;
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
  const doseResponse = calculateDoseResponse(pairs, predictor, options, outcome.unit, estimate);
  const outcomeScale = standardDeviation(pairs.map((pair) => pair.outcome)) || 1;
  const explicitPracticalThreshold = PRACTICAL_EFFECT_THRESHOLDS[outcome.id];
  const practicalThreshold = explicitPracticalThreshold ?? .2;
  const practicalEffectThreshold = explicitPracticalThreshold ?? .2 * outcomeScale;
  const stability = stabilityForEstimate(pairs, predictor, options, estimate, practicalEffectThreshold, lagDays);
  const minimumDaysRemaining = predictor.kind === "binary"
    ? Math.max(0, MINIMUM_BINARY_GROUP - pairs.filter((pair) => pair.predictor === 0).length)
      + Math.max(0, MINIMUM_BINARY_GROUP - pairs.filter((pair) => pair.predictor === 1).length)
    : Math.max(0, MINIMUM_DAILY_OBSERVATIONS - pairs.length);
  const minimum = predictor.kind === "binary" ? `${MINIMUM_BINARY_GROUP} yes and ${MINIMUM_BINARY_GROUP} no days` : `${MINIMUM_DAILY_OBSERVATIONS} paired days`;
  const exclusionReasons = estimate ? [] : [`At least ${minimum} are required`];
  if (estimate && Math.abs(estimate.effect) < (options.minimumMeaningfulEffect ?? 0)) exclusionReasons.push("Effect is below the practical display threshold");
  const bounds = estimate ? estimateConfidenceBounds(estimate) : null;
  const confidenceLow = bounds?.low ?? null;
  const confidenceHigh = bounds?.high ?? null;
  const sourceName = coverageBySource.map((item) => item.source).join(" + ") || "All data";
  const practicalRatio = estimate
    ? explicitPracticalThreshold === undefined
      ? Math.abs(estimate.effect) / outcomeScale / practicalThreshold
      : Math.abs(estimate.effect) / practicalThreshold
    : 0;
  const relation: MatrixRelation = {
    predictorId: predictor.id, predictorLabel: predictor.label, predictorUnit: predictor.unit, predictorKind: predictor.kind,
    predictorPresentation: predictor.presentation ?? "amount",
    predictorLow: estimate ? round(estimate.predictorLow, 2) : null, predictorHigh: estimate ? round(estimate.predictorHigh, 2) : null, predictorDelta: estimate ? round(estimate.predictorDelta, 2) : null,
    outcomeId: outcome.id, outcomeLabel: outcome.label, outcomeUnit: outcome.unit,
    coefficient: estimate ? round(estimate.coefficient, 3) : null, effect: estimate ? round(estimate.effect, 3) : null,
    effectConfidenceLow: confidenceLow === null ? null : round(confidenceLow, 3), effectConfidenceHigh: confidenceHigh === null ? null : round(confidenceHigh, 3),
    percentEffect: estimate ? relativePercent(estimate.effect, estimate.baselineMean, outcome.unit) : null,
    baselineMean: estimate ? round(estimate.baselineMean, 2) : null, comparisonMean: estimate ? round(estimate.comparisonMean, 2) : null,
    baselineCount: estimate?.baselineCount ?? 0, comparisonCount: estimate?.comparisonCount ?? 0, comparisonLabel: estimate?.comparisonLabel ?? "not enough data",
    modelType: estimate?.modelType ?? (predictor.kind === "binary" ? "binary" : "linear"), modelImprovement: round(estimate?.modelImprovement ?? 0, 3),
    nonlinearTested: estimate?.modelType !== "binary" && nonlinearTestEligible(pairs, predictor),
    sampleSize: pairs.length, effectiveSampleSize: pairs.length, pValue: estimate?.pValue ?? 1, qValue: estimate?.pValue ?? 1,
    confidenceLow: confidenceLow === null ? -1 : confidenceLow / outcomeScale, confidenceHigh: confidenceHigh === null ? 1 : confidenceHigh / outcomeScale,
    relevance: 0, lagDays, grain, timeScale, period, family, method: "within-person-calendar-hac",
    evidence: estimate ? "exploratory" : "insufficient", stable: false,
    stability,
    strength: estimate ? "light" : "hidden", coverageBySource,
    sourceEstimates: estimate ? [{ source: sourceName, sampleSize: pairs.length, effect: round(estimate.effect, 1), effectConfidenceLow: round(confidenceLow ?? estimate.effect, 1), effectConfidenceHigh: round(confidenceHigh ?? estimate.effect, 1), coefficient: round(estimate.coefficient, 3), pValue: estimate.pValue }] : [],
    doseResponse,
    habitualPredictorDelta: estimate?.habitualPredictorDelta === null || estimate?.habitualPredictorDelta === undefined ? null : round(estimate.habitualPredictorDelta, 2),
    habitualEffect: estimate?.habitualEffect === null || estimate?.habitualEffect === undefined ? null : round(estimate.habitualEffect, 1),
    minimumDaysRemaining,
    practicallyMeaningful: false, practicalThreshold, practicalRatio: round(practicalRatio, 3),
    featureEligible: false, exclusionReasons, excluded: false,
  };
  return finalizeRelation(relation, relation.pValue);
}

export function calculateCorrelationMatrix(predictors: MatrixSeries[], outcomes: MatrixSeries[], lagDays = 0) {
  return adjustMatrixRelations(predictors.flatMap((predictor) => outcomes.filter((outcome) => outcome.id !== predictor.id).map((outcome) => calculateMatrixRelation(predictor, outcome, lagDays))));
}
