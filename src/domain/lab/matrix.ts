export const MINIMUM_COMPUTABLE_OBSERVATIONS = 6;

export type MatrixPoint = { date: string; value: number; segment?: string };
export type MatrixSeries = {
  id: string;
  label: string;
  unit: string;
  kind: "numeric" | "binary";
  points: MatrixPoint[];
};

export type MatrixRelation = {
  predictorId: string;
  predictorLabel: string;
  outcomeId: string;
  outcomeLabel: string;
  outcomeUnit: string;
  coefficient: number | null;
  effect: number | null;
  sampleSize: number;
  effectiveSampleSize: number;
  pValue: number;
  qValue: number;
  confidenceLow: number;
  confidenceHigh: number;
  relevance: number;
  lagDays: number;
  grain?: "day" | "week";
  method: "spearman" | "rank-biserial";
  evidence: "collecting" | "early" | "growing" | "established";
  stable: boolean;
  strength: "hidden" | "light" | "clear" | "strong";
  excluded: boolean;
};

type Pair = { date: string; predictor: number; outcome: number; segment: string };

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ranks(values: number[]) {
  const ordered = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = new Array<number>(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start;
    while (end + 1 < ordered.length && ordered[end + 1].value === ordered[start].value) end += 1;
    const rank = (start + end + 2) / 2;
    for (let index = start; index <= end; index += 1) result[ordered[index].index] = rank;
    start = end + 1;
  }
  return result;
}

function pairedPoints(predictor: MatrixSeries, outcome: MatrixSeries, lagDays: number) {
  const outcomes = new Map(outcome.points.map((point) => [point.date, point]));
  return predictor.points.flatMap((point) => {
    const outcomePoint = outcomes.get(addDays(point.date, lagDays));
    if (!outcomePoint || (point.segment && outcomePoint.segment && point.segment !== outcomePoint.segment)) return [];
    return [{ date: point.date, predictor: point.value, outcome: outcomePoint.value, segment: point.segment ?? outcomePoint.segment ?? "all" }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function groupedPairs(pairs: Pair[]) {
  const grouped = new Map<string, Pair[]>();
  for (const pair of pairs) grouped.set(pair.segment, [...(grouped.get(pair.segment) ?? []), pair]);
  return [...grouped.values()];
}

function stratifiedRanks(pairs: Pair[], key: "predictor" | "outcome") {
  const ranked = new Map<Pair, number>();
  for (const group of groupedPairs(pairs)) {
    const groupRanks = ranks(group.map((pair) => pair[key]));
    group.forEach((pair, index) => ranked.set(pair, (groupRanks[index] - 0.5) / group.length));
  }
  return pairs.map((pair) => ranked.get(pair) as number);
}

function pearson(first: number[], second: number[]) {
  if (first.length !== second.length || first.length < 2) return null;
  const firstMean = mean(first);
  const secondMean = mean(second);
  let numerator = 0;
  let firstSquared = 0;
  let secondSquared = 0;
  for (let index = 0; index < first.length; index += 1) {
    const firstDelta = first[index] - firstMean;
    const secondDelta = second[index] - secondMean;
    numerator += firstDelta * secondDelta;
    firstSquared += firstDelta * firstDelta;
    secondSquared += secondDelta * secondDelta;
  }
  const denominator = Math.sqrt(firstSquared * secondSquared);
  return denominator === 0 ? null : numerator / denominator;
}

function effectiveSampleSize(pairs: Pair[]) {
  if (pairs.length < 5) return pairs.length;
  const predictorRanks = stratifiedRanks(pairs, "predictor");
  const outcomeRanks = stratifiedRanks(pairs, "outcome");
  const predictorAutocorrelation = pearson(predictorRanks.slice(0, -1), predictorRanks.slice(1));
  const outcomeAutocorrelation = pearson(outcomeRanks.slice(0, -1), outcomeRanks.slice(1));
  if (predictorAutocorrelation === null || outcomeAutocorrelation === null) return pairs.length;
  const product = predictorAutocorrelation * outcomeAutocorrelation;
  const estimate = 1 + product <= 0 ? pairs.length : pairs.length * (1 - product) / (1 + product);
  return Math.min(pairs.length, Math.max(4, estimate));
}

function rankBiserial(groups: Pair[]) {
  const exposed = groups.filter((point) => point.predictor === 1);
  const unexposed = groups.filter((point) => point.predictor === 0);
  if (exposed.length < 2 || unexposed.length < 2) return null;
  const rankedOutcomes = ranks(groups.map((point) => point.outcome));
  const exposedRankSum = groups.reduce((sum, point, index) => sum + (point.predictor === 1 ? rankedOutcomes[index] : 0), 0);
  const u = exposedRankSum - exposed.length * (exposed.length + 1) / 2;
  return 2 * u / (exposed.length * unexposed.length) - 1;
}

function coefficientFor(predictor: MatrixSeries, pairs: Pair[]) {
  if (predictor.kind === "binary") return rankBiserial(pairs);
  return pearson(stratifiedRanks(pairs, "predictor"), stratifiedRanks(pairs, "outcome"));
}

function effectFor(predictor: MatrixSeries, pairs: Pair[]) {
  const effects = groupedPairs(pairs).flatMap((group) => {
    if (predictor.kind === "binary") {
      const exposed = group.filter((point) => point.predictor === 1).map((point) => point.outcome);
      const unexposed = group.filter((point) => point.predictor === 0).map((point) => point.outcome);
      return exposed.length >= 2 && unexposed.length >= 2 ? [{ value: mean(exposed) - mean(unexposed), weight: group.length }] : [];
    }
    if (group.length < MINIMUM_COMPUTABLE_OBSERVATIONS) return [];
    const ordered = [...group].sort((a, b) => a.predictor - b.predictor);
    const groupSize = Math.max(2, Math.floor(ordered.length / 3));
    return [{ value: mean(ordered.slice(-groupSize).map((point) => point.outcome)) - mean(ordered.slice(0, groupSize).map((point) => point.outcome)), weight: group.length }];
  });
  const totalWeight = effects.reduce((sum, effect) => sum + effect.weight, 0);
  return totalWeight ? effects.reduce((sum, effect) => sum + effect.value * effect.weight, 0) / totalWeight : null;
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const adjusted = value - 1;
  let sum = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) sum += coefficients[index] / (adjusted + index + 1);
  const base = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(base) - base + Math.log(sum);
}

function betaFraction(x: number, first: number, second: number) {
  const maxIterations = 200;
  const epsilon = 3e-12;
  const minimum = 1e-30;
  const total = first + second;
  let c = 1;
  let d = 1 - total * x / (first + 1);
  if (Math.abs(d) < minimum) d = minimum;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const twice = iteration * 2;
    let factor = iteration * (second - iteration) * x / ((first + twice - 1) * (first + twice));
    d = 1 + factor * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + factor / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    result *= d * c;
    factor = -(first + iteration) * (total + iteration) * x / ((first + twice) * (first + twice + 1));
    d = 1 + factor * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + factor / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedBeta(x: number, first: number, second: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(first + second) - logGamma(first) - logGamma(second)
    + first * Math.log(x) + second * Math.log(1 - x),
  );
  return x < (first + 1) / (first + second + 2)
    ? factor * betaFraction(x, first, second) / first
    : 1 - factor * betaFraction(1 - x, second, first) / second;
}

function pValueFor(coefficient: number, sampleSize: number) {
  if (Math.abs(coefficient) >= 1) return 0;
  if (sampleSize <= 2) return 1;
  const degrees = sampleSize - 2;
  const statisticSquared = coefficient * coefficient * degrees / Math.max(1e-12, 1 - coefficient * coefficient);
  return regularizedBeta(degrees / (degrees + statisticSquared), degrees / 2, 0.5);
}

function confidenceInterval(coefficient: number, sampleSize: number) {
  if (Math.abs(coefficient) >= 0.999999) return [coefficient, coefficient] as const;
  if (sampleSize <= 3) return [-1, 1] as const;
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, coefficient)));
  const margin = 1.959963984540054 / Math.sqrt(sampleSize - 3);
  return [Math.tanh(z - margin), Math.tanh(z + margin)] as const;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finalizeRelation(relation: MatrixRelation, qValue: number) {
  if (relation.coefficient === null) return relation;
  const intervalWidth = relation.confidenceHigh - relation.confidenceLow;
  const precision = Math.max(0, Math.min(1, 1 - intervalWidth / 2));
  const sampleWeight = Math.min(1, Math.log1p(relation.effectiveSampleSize) / Math.log(31));
  const relevance = Math.abs(relation.coefficient) * precision * sampleWeight * (1 - Math.min(1, qValue));
  const stable = relation.confidenceLow > 0 || relation.confidenceHigh < 0;
  const evidence: MatrixRelation["evidence"] = stable && qValue <= 0.05
    ? "established"
    : stable && qValue <= 0.2
      ? "growing"
      : "early";
  const strength: MatrixRelation["strength"] = relevance < 0.015
    ? "hidden"
    : relevance < 0.06
      ? "light"
      : relevance < 0.15
        ? "clear"
        : "strong";
  return {
    ...relation,
    qValue,
    relevance: round(relevance, 4),
    evidence,
    stable,
    strength,
  };
}

export function adjustMatrixRelations(relations: MatrixRelation[]) {
  const calculable = relations
    .map((relation, index) => ({ relation, index }))
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

export function calculateMatrixRelation(predictor: MatrixSeries, outcome: MatrixSeries, lagDays = 0): MatrixRelation {
  const pairs = pairedPoints(predictor, outcome, lagDays);
  const enoughPairs = pairs.length >= MINIMUM_COMPUTABLE_OBSERVATIONS;
  const coefficient = enoughPairs ? coefficientFor(predictor, pairs) : null;
  const effective = coefficient === null ? pairs.length : effectiveSampleSize(pairs);
  const interval = coefficient === null ? [-1, 1] as const : confidenceInterval(coefficient, effective);
  const pValue = coefficient === null ? 1 : pValueFor(coefficient, effective);
  const relation: MatrixRelation = {
    predictorId: predictor.id,
    predictorLabel: predictor.label,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    outcomeUnit: outcome.unit,
    coefficient,
    effect: coefficient === null ? null : round(effectFor(predictor, pairs) ?? 0, 1),
    sampleSize: pairs.length,
    effectiveSampleSize: round(effective, 1),
    pValue,
    qValue: pValue,
    confidenceLow: interval[0],
    confidenceHigh: interval[1],
    relevance: 0,
    lagDays,
    method: predictor.kind === "binary" ? "rank-biserial" : "spearman",
    evidence: coefficient === null ? "collecting" : "early",
    stable: false,
    strength: "hidden",
    excluded: false,
  };
  return finalizeRelation(relation, pValue);
}

export function calculateCorrelationMatrix(predictors: MatrixSeries[], outcomes: MatrixSeries[], lagDays = 0) {
  return adjustMatrixRelations(predictors.flatMap((predictor) => outcomes
    .filter((outcome) => outcome.id !== predictor.id)
    .map((outcome) => calculateMatrixRelation(predictor, outcome, lagDays))));
}
