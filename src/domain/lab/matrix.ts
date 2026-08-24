export const MINIMUM_DAILY_OBSERVATIONS = 15;
export const MINIMUM_WEEKLY_OBSERVATIONS = 8;
export const MINIMUM_DAILY_HIGHLIGHT = 30;
export const MINIMUM_WEEKLY_HIGHLIGHT = 20;
export const MINIMUM_BINARY_GROUP = 5;

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
  sampleSize: number; effectiveSampleSize: number; pValue: number; qValue: number; confidenceLow: number; confidenceHigh: number;
  relevance: number; lagDays: number; grain: "day" | "week"; timeScale: "acute" | "chronic";
  family: "automatic-acute" | "automatic-chronic" | "journal-acute" | "journal-chronic";
  method: "adjusted-dynamic-regression";
  evidence: "insufficient" | "exploratory" | "promising" | "established";
  stable: boolean; stability: MatrixStability; strength: "hidden" | "light" | "clear" | "strong";
  coverageBySource: MatrixSourceCoverage[]; sourceEstimates: MatrixSourceEstimate[];
  featureEligible: boolean; exclusionReasons: string[]; excluded: boolean;
};
export type MatrixRelationOptions = {
  grain?: "day" | "week"; timeScale?: "acute" | "chronic"; family?: MatrixRelation["family"]; minimumMeaningfulEffect?: number;
};

type Pair = { date: string; predictor: number; outcome: number; previousOutcome: number; segment: string };
type ModelEstimate = MatrixSourceEstimate & { standardError: number; predictorLow: number; predictorHigh: number; predictorDelta: number };

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
function round(value: number, digits = 3) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

function pairedPoints(predictor: MatrixSeries, outcome: MatrixSeries, lagDays: number, grain: "day" | "week") {
  const outcomes = new Map(outcome.points.map((point) => [point.date, point]));
  const previousOffset = grain === "week" ? 7 : 1;
  return predictor.points.flatMap((point) => {
    const outcomeDate = addDays(point.date, lagDays);
    const outcomePoint = outcomes.get(outcomeDate);
    const previousOutcome = outcomes.get(addDays(outcomeDate, -previousOffset));
    if (!outcomePoint || !previousOutcome) return [];
    if (point.segment && outcomePoint.segment && point.segment !== outcomePoint.segment) return [];
    if (outcomePoint.segment && previousOutcome.segment && outcomePoint.segment !== previousOutcome.segment) return [];
    return [{
      date: point.date, predictor: point.value, outcome: outcomePoint.value, previousOutcome: previousOutcome.value,
      segment: point.segment ?? outcomePoint.segment ?? previousOutcome.segment ?? "All data",
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function rawCoverage(predictor: MatrixSeries, outcome: MatrixSeries, lagDays: number, grain: "day" | "week") {
  const outcomes = new Map(outcome.points.map((point) => [point.date, point]));
  const grouped = new Map<string, number>();
  for (const point of predictor.points) {
    const outcomePoint = outcomes.get(addDays(point.date, lagDays));
    if (!outcomePoint || (point.segment && outcomePoint.segment && point.segment !== outcomePoint.segment)) continue;
    const source = point.segment ?? outcomePoint.segment ?? "All data";
    grouped.set(source, (grouped.get(source) ?? 0) + 1);
  }
  return [...grouped].map(([source, count]) => ({ source, pairedDays: grain === "day" ? count : 0, pairedWeeks: grain === "week" ? count : 0 }));
}
function groupedPairs(pairs: Pair[]) {
  const grouped = new Map<string, Pair[]>();
  for (const pair of pairs) grouped.set(pair.segment, [...(grouped.get(pair.segment) ?? []), pair]);
  return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second));
}

function invert(matrix: number[][]) {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, ...Array.from({ length: size }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0)]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    augmented[column] = augmented[column].map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      augmented[row] = augmented[row].map((value, index) => value - factor * augmented[column][index]);
    }
  }
  return augmented.map((row) => row.slice(size));
}
function residualize(values: number[], controls: number[][]) {
  const columns = controls[0]?.length ?? 0;
  const cross = Array.from({ length: columns }, () => Array(columns).fill(0));
  const target = Array(columns).fill(0);
  for (let row = 0; row < controls.length; row += 1) for (let first = 0; first < columns; first += 1) {
    target[first] += controls[row][first] * values[row];
    for (let second = 0; second < columns; second += 1) cross[first][second] += controls[row][first] * controls[row][second];
  }
  for (let index = 1; index < columns; index += 1) cross[index][index] += 1e-8;
  const inverse = invert(cross);
  if (!inverse) return null;
  const beta = inverse.map((row) => row.reduce((sum, value, index) => sum + value * target[index], 0));
  return values.map((value, row) => value - controls[row].reduce((sum, control, column) => sum + control * beta[column], 0));
}
function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
function normalPValue(statistic: number) { const cdf = 0.5 * (1 + erf(Math.abs(statistic) / Math.SQRT2)); return Math.max(0, Math.min(1, 2 * (1 - cdf))); }
function modelControls(pairs: Pair[], grain: "day" | "week") {
  const previous = pairs.map((pair) => pair.previousOutcome);
  const previousMean = mean(previous);
  const previousScale = standardDeviation(previous) || 1;
  const firstTime = new Date(`${pairs[0].date}T12:00:00Z`).getTime();
  const lastTime = new Date(`${pairs.at(-1)?.date}T12:00:00Z`).getTime();
  const timeSpan = Math.max(86_400_000, lastTime - firstTime);
  const deviceIndicators = [...new Set(pairs.map((pair) => pair.segment))].sort().slice(1);
  return pairs.map((pair, index) => {
    const time = 2 * (new Date(`${pair.date}T12:00:00Z`).getTime() - firstTime) / timeSpan - 1;
    const weekday = new Date(`${pair.date}T12:00:00Z`).getUTCDay();
    const longitudinalControls = grain === "day"
      ? [1, (previous[index] - previousMean) / previousScale, Math.sin(2 * Math.PI * weekday / 7), Math.cos(2 * Math.PI * weekday / 7), time, time * time]
      : [1, (previous[index] - previousMean) / previousScale, time, time * time];
    return [...longitudinalControls, ...deviceIndicators.map((device) => pair.segment === device ? 1 : 0)];
  });
}
function winsorize(values: number[]) {
  const low = quantile(values, 0.025);
  const high = quantile(values, 0.975);
  return values.map((value) => Math.max(low, Math.min(high, value)));
}

function fitAdjustedModel(source: string, pairs: Pair[], kind: MatrixSeries["kind"], grain: "day" | "week", limitOutliers = false): ModelEstimate | null {
  const minimum = grain === "day" ? MINIMUM_DAILY_OBSERVATIONS : MINIMUM_WEEKLY_OBSERVATIONS;
  // The first observation of each device segment conditions the lagged-outcome model.
  if (pairs.length < minimum - 1) return null;
  if (kind === "binary" && (pairs.filter((pair) => pair.predictor === 1).length < MINIMUM_BINARY_GROUP || pairs.filter((pair) => pair.predictor === 0).length < MINIMUM_BINARY_GROUP)) return null;
  const rawPredictors = limitOutliers ? winsorize(pairs.map((pair) => pair.predictor)) : pairs.map((pair) => pair.predictor);
  const rawOutcomes = limitOutliers ? winsorize(pairs.map((pair) => pair.outcome)) : pairs.map((pair) => pair.outcome);
  const lower = kind === "binary" ? 0 : quantile(rawPredictors, 0.25);
  const upper = kind === "binary" ? 1 : quantile(rawPredictors, 0.75);
  const contrast = upper - lower;
  if (Math.abs(contrast) < 1e-9 || standardDeviation(rawOutcomes) < 1e-9) return null;
  const predictors = rawPredictors.map((value) => (value - lower) / contrast);
  const controls = modelControls(pairs, grain);
  const residualPredictors = residualize(predictors, controls);
  const residualOutcomes = residualize(rawOutcomes, controls);
  if (!residualPredictors || !residualOutcomes) return null;
  const predictorSquared = residualPredictors.reduce((sum, value) => sum + value * value, 0);
  if (predictorSquared < 1e-8) return null;
  const effect = residualPredictors.reduce((sum, value, index) => sum + value * residualOutcomes[index], 0) / predictorSquared;
  const residuals = residualOutcomes.map((value, index) => value - effect * residualPredictors[index]);
  const scores = residualPredictors.map((value, index) => value * residuals[index]);
  const maximumLag = grain === "day" ? Math.min(7, Math.floor(pairs.length / 4)) : Math.min(2, Math.floor(pairs.length / 4));
  let meat = scores.reduce((sum, value) => sum + value * value, 0);
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    const weight = 1 - lag / (maximumLag + 1);
    let covariance = 0;
    for (let index = lag; index < scores.length; index += 1) covariance += scores[index] * scores[index - lag];
    meat += 2 * weight * covariance;
  }
  const correction = pairs.length / Math.max(1, pairs.length - controls[0].length - 1);
  const standardError = Math.sqrt(Math.max(0, correction * meat / (predictorSquared * predictorSquared)));
  if (!Number.isFinite(standardError)) return null;
  const pValue = standardError < 1e-12 ? (Math.abs(effect) < 1e-12 ? 1 : 0) : normalPValue(effect / standardError);
  return {
    source, sampleSize: pairs.length, effect, standardError, pValue,
    predictorLow: lower,
    predictorHigh: upper,
    predictorDelta: contrast,
    effectConfidenceLow: effect - 1.959963984540054 * standardError,
    effectConfidenceHigh: effect + 1.959963984540054 * standardError,
    coefficient: effect / (standardDeviation(rawOutcomes) || 1),
  };
}

function sourceCenteredDirection(pairs: Pair[]) {
  let covariance = 0;
  for (const [, group] of groupedPairs(pairs)) {
    const predictorMean = mean(group.map((pair) => pair.predictor));
    const outcomeMean = mean(group.map((pair) => pair.outcome));
    covariance += group.reduce((sum, pair) => sum + (pair.predictor - predictorMean) * (pair.outcome - outcomeMean), 0);
  }
  return Math.sign(covariance);
}
function chronologicalStability(pairs: Pair[], direction: number) {
  if (!direction || pairs.length < 12) return { held: false, blocks: 0 };
  const matches = Array.from({ length: 4 }, (_, block) => {
    const start = Math.floor(block * pairs.length / 4);
    const end = Math.floor((block + 1) * pairs.length / 4);
    return sourceCenteredDirection(pairs.slice(start, end)) === direction;
  }).filter(Boolean).length;
  return { held: matches >= 3, blocks: matches };
}
function finalizeRelation(relation: MatrixRelation, qValue: number): MatrixRelation {
  if (relation.coefficient === null) return { ...relation, qValue: 1 };
  const highlightMinimum = relation.grain === "day" ? MINIMUM_DAILY_HIGHLIGHT : MINIMUM_WEEKLY_HIGHLIGHT;
  const featureEligible = relation.sampleSize >= highlightMinimum
    && qValue <= 0.1
    && relation.stability.directionHeldInBlocks
    && relation.stability.trendAdjustedDirectionHeld
    && relation.stability.outlierAdjustedDirectionHeld
    && !relation.exclusionReasons.includes("Effect smaller than the practical threshold");
  const evidence: MatrixRelation["evidence"] = !featureEligible ? "exploratory" : qValue <= 0.05 ? "established" : qValue <= 0.1 ? "promising" : "exploratory";
  const strength: MatrixRelation["strength"] = evidence === "established" ? "strong" : evidence === "promising" ? "clear" : "light";
  const exclusionReasons = [...relation.exclusionReasons];
  if (qValue > 0.1) exclusionReasons.push("q value above the 0.10 highlight threshold");
  if (relation.sampleSize < highlightMinimum) exclusionReasons.push(`${highlightMinimum} paired ${relation.grain === "day" ? "days" : "weeks"} required for a highlight`);
  if (!relation.stability.directionHeldInBlocks) exclusionReasons.push("Direction not preserved in at least 3 of 4 time blocks");
  if (!relation.stability.outlierAdjustedDirectionHeld) exclusionReasons.push("Direction changes after limiting extreme values");
  return {
    ...relation, qValue, featureEligible, evidence, stable: featureEligible,
    strength,
    relevance: evidence === "established" ? 4 : evidence === "promising" ? 3 : 1,
    exclusionReasons: [...new Set(exclusionReasons)],
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
  return relations.map((relation, index) => finalizeRelation(relation, qValues.get(index) ?? relation.qValue));
}

export function calculateMatrixRelation(predictor: MatrixSeries, outcome: MatrixSeries, lagDays = 0, options: MatrixRelationOptions = {}): MatrixRelation {
  const grain = options.grain ?? "day";
  const timeScale = options.timeScale ?? (grain === "day" ? "acute" : "chronic");
  const family = options.family ?? (timeScale === "acute" ? "automatic-acute" : "automatic-chronic");
  const pairs = pairedPoints(predictor, outcome, lagDays, grain);
  const coverageBySource = rawCoverage(predictor, outcome, lagDays, grain);
  const pooledSource = coverageBySource.map((coverage) => coverage.source).join(" + ") || "All data";
  const combined = fitAdjustedModel(pooledSource, pairs, predictor.kind, grain);
  const estimates = combined ? [combined] : [];
  const direction = Math.sign(combined?.effect ?? 0);
  const blockStability = chronologicalStability(pairs, direction);
  const winsorized = fitAdjustedModel(pooledSource, pairs, predictor.kind, grain, true);
  const minimum = grain === "day" ? MINIMUM_DAILY_OBSERVATIONS : MINIMUM_WEEKLY_OBSERVATIONS;
  const exclusionReasons: string[] = [];
  if (!combined) exclusionReasons.push(`At least ${minimum} adjusted pairs are required across the full history`);
  if (predictor.kind === "binary" && (pairs.filter((pair) => pair.predictor === 1).length < MINIMUM_BINARY_GROUP || pairs.filter((pair) => pair.predictor === 0).length < MINIMUM_BINARY_GROUP)) exclusionReasons.push(`At least ${MINIMUM_BINARY_GROUP} yes and ${MINIMUM_BINARY_GROUP} no observations are required across the full history`);
  if (combined && Math.abs(combined.effect) < (options.minimumMeaningfulEffect ?? 0)) exclusionReasons.push("Effect smaller than the practical threshold");
  const intervalScale = combined ? standardDeviation(pairs.map((pair) => pair.outcome)) || 1 : 1;
  const relation: MatrixRelation = {
    predictorId: predictor.id, predictorLabel: predictor.label, predictorUnit: predictor.unit, predictorKind: predictor.kind,
    predictorPresentation: predictor.presentation ?? "amount",
    predictorLow: combined ? round(combined.predictorLow, 3) : null,
    predictorHigh: combined ? round(combined.predictorHigh, 3) : null,
    predictorDelta: combined ? round(combined.predictorDelta, 3) : null,
    outcomeId: outcome.id, outcomeLabel: outcome.label, outcomeUnit: outcome.unit,
    coefficient: combined ? round(combined.coefficient, 3) : null,
    effect: combined ? round(combined.effect, 1) : null,
    effectConfidenceLow: combined ? round(combined.effectConfidenceLow, 1) : null,
    effectConfidenceHigh: combined ? round(combined.effectConfidenceHigh, 1) : null,
    sampleSize: coverageBySource.reduce((sum, coverage) => sum + (grain === "day" ? coverage.pairedDays : coverage.pairedWeeks), 0),
    effectiveSampleSize: pairs.length,
    pValue: combined?.pValue ?? 1, qValue: combined?.pValue ?? 1,
    confidenceLow: combined ? combined.effectConfidenceLow / intervalScale : -1,
    confidenceHigh: combined ? combined.effectConfidenceHigh / intervalScale : 1,
    relevance: 0, lagDays, grain, timeScale, family, method: "adjusted-dynamic-regression",
    evidence: combined ? "exploratory" : "insufficient", stable: false,
    stability: {
      chronologicalBlocks: blockStability.blocks,
      directionHeldInBlocks: blockStability.held,
      trendAdjustedDirectionHeld: Boolean(direction && sourceCenteredDirection(pairs) === direction),
      outlierAdjustedDirectionHeld: Boolean(direction && Math.sign(winsorized?.effect ?? 0) === direction),
    },
    strength: combined ? "light" : "hidden",
    coverageBySource,
    sourceEstimates: estimates.map((estimate) => ({
      source: estimate.source,
      sampleSize: estimate.sampleSize,
      effect: round(estimate.effect, 1),
      effectConfidenceLow: round(estimate.effectConfidenceLow, 1),
      effectConfidenceHigh: round(estimate.effectConfidenceHigh, 1),
      coefficient: round(estimate.coefficient, 3),
      pValue: estimate.pValue,
    })),
    featureEligible: false, exclusionReasons, excluded: false,
  };
  return finalizeRelation(relation, relation.pValue);
}

export function calculateCorrelationMatrix(predictors: MatrixSeries[], outcomes: MatrixSeries[], lagDays = 0) {
  return adjustMatrixRelations(predictors.flatMap((predictor) => outcomes.filter((outcome) => outcome.id !== predictor.id).map((outcome) => calculateMatrixRelation(predictor, outcome, lagDays))));
}
