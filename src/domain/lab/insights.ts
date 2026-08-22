import { spearmanCorrelation } from "@/domain/correlations/spearman";

export type LabObservation = {
  date: string;
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  sleepRegularity: number | null;
  sleepDebtMinutes: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  steps: number | null;
  zoneMinutes: number | null;
  deepWorkMinutes: number | null;
  energy: number | null;
  focus: number | null;
  stress: number | null;
  mood: number | null;
  soreness: number | null;
  caffeine: number | null;
  alcohol: number | null;
  lateMeal: boolean | null;
  illness: boolean | null;
};

export type LabConfidence = "early" | "promising" | "strong";
export type LabDiscovery = {
  id: string;
  kind: "threshold" | "correlation";
  title: string;
  description: string;
  evidence: string;
  effect: number;
  effectUnit: "minutes" | "points";
  coefficient: number | null;
  sampleSize: number;
  lagDays: number;
  confidence: LabConfidence;
  stable: boolean;
  score: number;
  predictor: string;
  outcome: string;
};

type NumericKey = Exclude<keyof LabObservation, "date" | "lateMeal" | "illness">;
type PredictorKey = NumericKey | "lateMeal" | "illness";

type ThresholdRule = {
  id: string;
  predictor: PredictorKey;
  outcome: NumericKey;
  lagDays: number;
  split: (value: number | boolean) => boolean;
  highLabel: string;
  lowLabel: string;
  predictorLabel: string;
};

type CorrelationRule = {
  predictor: NumericKey;
  outcome: NumericKey;
  lagDays: number;
  predictorLabel: string;
};

const outcomeLabels: Partial<Record<NumericKey, string>> = {
  deepWorkMinutes: "deep work",
  energy: "energy",
  focus: "focus",
  stress: "stress",
  mood: "mood",
  sleepMinutes: "sleep",
  sleepEfficiency: "sleep efficiency",
  recoveryScore: "recovery",
};

const outcomeUnits: Partial<Record<NumericKey, "minutes" | "points">> = {
  deepWorkMinutes: "minutes",
  sleepMinutes: "minutes",
};

const thresholdRules: ThresholdRule[] = [
  { id: "sleep-8h-dw", predictor: "sleepMinutes", outcome: "deepWorkMinutes", lagDays: 0, split: (v) => Number(v) >= 480, highLabel: "8h+ sleep", lowLabel: "under 8h", predictorLabel: "8h+ sleep" },
  { id: "sleep-8h-focus", predictor: "sleepMinutes", outcome: "focus", lagDays: 0, split: (v) => Number(v) >= 480, highLabel: "8h+ sleep", lowLabel: "under 8h", predictorLabel: "8h+ sleep" },
  { id: "sleep-8h-energy", predictor: "sleepMinutes", outcome: "energy", lagDays: 0, split: (v) => Number(v) >= 480, highLabel: "8h+ sleep", lowLabel: "under 8h", predictorLabel: "8h+ sleep" },
  { id: "sleep-efficiency-focus", predictor: "sleepEfficiency", outcome: "focus", lagDays: 0, split: (v) => Number(v) >= 90, highLabel: "90%+ sleep efficiency", lowLabel: "lower efficiency", predictorLabel: "efficient sleep" },
  { id: "sleep-regularity-dw", predictor: "sleepRegularity", outcome: "deepWorkMinutes", lagDays: 0, split: (v) => Number(v) >= 80, highLabel: "80%+ regularity", lowLabel: "lower regularity", predictorLabel: "regular sleep" },
  { id: "sleep-regularity-focus", predictor: "sleepRegularity", outcome: "focus", lagDays: 0, split: (v) => Number(v) >= 80, highLabel: "80%+ regularity", lowLabel: "lower regularity", predictorLabel: "regular sleep" },
  { id: "recovery-dw", predictor: "recoveryScore", outcome: "deepWorkMinutes", lagDays: 0, split: (v) => Number(v) >= 70, highLabel: "70+ recovery", lowLabel: "lower recovery", predictorLabel: "higher recovery" },
  { id: "recovery-energy", predictor: "recoveryScore", outcome: "energy", lagDays: 0, split: (v) => Number(v) >= 70, highLabel: "70+ recovery", lowLabel: "lower recovery", predictorLabel: "higher recovery" },
  { id: "steps-sleep", predictor: "steps", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) >= 8000, highLabel: "8,000+ steps", lowLabel: "fewer steps", predictorLabel: "8,000+ steps" },
  { id: "zone-sleep", predictor: "zoneMinutes", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) >= 30, highLabel: "30+ zone minutes", lowLabel: "fewer zone minutes", predictorLabel: "active days" },
  { id: "zone-recovery", predictor: "zoneMinutes", outcome: "recoveryScore", lagDays: 1, split: (v) => Number(v) >= 30, highLabel: "30+ zone minutes", lowLabel: "fewer zone minutes", predictorLabel: "active days" },
  { id: "caffeine-focus", predictor: "caffeine", outcome: "focus", lagDays: 0, split: (v) => Number(v) >= 3, highLabel: "3+ caffeinated drinks", lowLabel: "0–2 drinks", predictorLabel: "more caffeine" },
  { id: "caffeine-sleep", predictor: "caffeine", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) >= 3, highLabel: "3+ caffeinated drinks", lowLabel: "0–2 drinks", predictorLabel: "more caffeine" },
  { id: "alcohol-sleep", predictor: "alcohol", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) > 0, highLabel: "alcohol recorded", lowLabel: "none recorded", predictorLabel: "alcohol" },
  { id: "alcohol-recovery", predictor: "alcohol", outcome: "recoveryScore", lagDays: 1, split: (v) => Number(v) > 0, highLabel: "alcohol recorded", lowLabel: "none recorded", predictorLabel: "alcohol" },
  { id: "late-meal-sleep", predictor: "lateMeal", outcome: "sleepMinutes", lagDays: 1, split: Boolean, highLabel: "late meal recorded", lowLabel: "no late meal", predictorLabel: "late meals" },
  { id: "late-meal-recovery", predictor: "lateMeal", outcome: "recoveryScore", lagDays: 1, split: Boolean, highLabel: "late meal recorded", lowLabel: "no late meal", predictorLabel: "late meals" },
  { id: "stress-dw", predictor: "stress", outcome: "deepWorkMinutes", lagDays: 0, split: (v) => Number(v) >= 4, highLabel: "high stress", lowLabel: "lower stress", predictorLabel: "high stress" },
  { id: "stress-sleep", predictor: "stress", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) >= 4, highLabel: "high stress", lowLabel: "lower stress", predictorLabel: "high stress" },
  { id: "dw-sleep", predictor: "deepWorkMinutes", outcome: "sleepMinutes", lagDays: 1, split: (v) => Number(v) >= 120, highLabel: "2h+ deep work", lowLabel: "less deep work", predictorLabel: "deep-work days" },
  { id: "illness-energy", predictor: "illness", outcome: "energy", lagDays: 0, split: Boolean, highLabel: "illness recorded", lowLabel: "no illness", predictorLabel: "illness" },
];

const correlationPredictors: Array<Pick<CorrelationRule, "predictor" | "predictorLabel">> = [
  { predictor: "sleepMinutes", predictorLabel: "sleep duration" },
  { predictor: "sleepEfficiency", predictorLabel: "sleep efficiency" },
  { predictor: "sleepRegularity", predictorLabel: "sleep regularity" },
  { predictor: "sleepDebtMinutes", predictorLabel: "sleep debt" },
  { predictor: "hrv", predictorLabel: "HRV" },
  { predictor: "restingHeartRate", predictorLabel: "resting heart rate" },
  { predictor: "recoveryScore", predictorLabel: "recovery" },
  { predictor: "effortScore", predictorLabel: "effort" },
  { predictor: "steps", predictorLabel: "steps" },
  { predictor: "zoneMinutes", predictorLabel: "zone minutes" },
  { predictor: "caffeine", predictorLabel: "caffeine" },
  { predictor: "stress", predictorLabel: "stress" },
];

const correlationOutcomes: NumericKey[] = ["deepWorkMinutes", "focus", "energy", "mood"];

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2))) || 1;
}

function confidenceFor(sampleSize: number, stable: boolean, normalizedEffect: number, groupBalance = 1): LabConfidence {
  if (sampleSize >= 42 && stable && normalizedEffect >= 0.5 && groupBalance >= 0.2) return "strong";
  if (sampleSize >= 28 && stable && normalizedEffect >= 0.3 && groupBalance >= 0.12) return "promising";
  return "early";
}

function effectText(effect: number, unit: "minutes" | "points") {
  const absolute = Math.abs(effect);
  if (unit === "minutes") {
    const minutes = Math.round(absolute);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${minutes}m`;
  }
  return absolute.toFixed(1);
}

function sentenceCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function thresholdDiscovery(rule: ThresholdRule, observations: LabObservation[]): LabDiscovery | null {
  const byDate = new Map(observations.map((day) => [day.date, day]));
  const pairs = observations.flatMap((day) => {
    const predictor = day[rule.predictor];
    const outcome = byDate.get(addDays(day.date, rule.lagDays))?.[rule.outcome];
    if (predictor === null || outcome === null || outcome === undefined) return [];
    return [{ date: day.date, high: rule.split(predictor), value: Number(outcome) }];
  });
  const high = pairs.filter((pair) => pair.high).map((pair) => pair.value);
  const low = pairs.filter((pair) => !pair.high).map((pair) => pair.value);
  if (pairs.length < 14 || high.length < 5 || low.length < 5) return null;
  const effect = mean(high) - mean(low);
  const midpoint = Math.floor(pairs.length / 2);
  const halfEffects = [pairs.slice(0, midpoint), pairs.slice(midpoint)].map((half) => {
    const first = half.filter((pair) => pair.high).map((pair) => pair.value);
    const second = half.filter((pair) => !pair.high).map((pair) => pair.value);
    return first.length >= 2 && second.length >= 2 ? mean(first) - mean(second) : 0;
  });
  const stable = halfEffects.every((halfEffect) => halfEffect !== 0 && Math.sign(halfEffect) === Math.sign(effect));
  const normalizedEffect = Math.abs(effect) / standardDeviation(pairs.map((pair) => pair.value));
  if (normalizedEffect < 0.2) return null;
  const confidence = confidenceFor(pairs.length, stable, normalizedEffect, Math.min(high.length, low.length) / pairs.length);
  const unit = outcomeUnits[rule.outcome] ?? "points";
  const direction = effect >= 0 ? "more" : "less";
  const outcomeLabel = outcomeLabels[rule.outcome] ?? String(rule.outcome);
  return {
    id: rule.id,
    kind: "threshold",
    title: `${sentenceCase(rule.predictorLabel)} ↔ ${effectText(effect, unit)} ${direction} ${outcomeLabel}`,
    description: `On ${rule.highLabel} days, you recorded an average of ${effectText(effect, unit)} ${direction} ${outcomeLabel} than on ${rule.lowLabel} days.`,
    evidence: `${pairs.length} paired days · ${high.length} vs ${low.length}${rule.lagDays ? " · next day" : " · same day"}`,
    effect: Math.round(effect * 10) / 10,
    effectUnit: unit,
    coefficient: null,
    sampleSize: pairs.length,
    lagDays: rule.lagDays,
    confidence,
    stable,
    score: normalizedEffect * Math.log2(pairs.length) * (stable ? 1 : 0.55) * (rule.outcome === "deepWorkMinutes" ? 1.45 : ["focus", "energy", "mood"].includes(rule.outcome) ? 0.78 : 1),
    predictor: rule.predictor,
    outcome: rule.outcome,
  };
}

function correlationDiscovery(rule: CorrelationRule, observations: LabObservation[]): LabDiscovery | null {
  const first = observations.flatMap((day) => day[rule.predictor] === null ? [] : [{ date: day.date, value: Number(day[rule.predictor]) }]);
  const second = observations.flatMap((day) => day[rule.outcome] === null ? [] : [{ date: day.date, value: Number(day[rule.outcome]) }]);
  const result = spearmanCorrelation(first, second, rule.lagDays);
  if (result.coefficient === null || Math.abs(result.coefficient) < 0.25) return null;
  const midpoint = Math.floor(observations.length / 2);
  const halfCoefficients = [observations.slice(0, midpoint), observations.slice(midpoint)].map((half) => {
    const x = half.flatMap((day) => day[rule.predictor] === null ? [] : [{ date: day.date, value: Number(day[rule.predictor]) }]);
    const y = half.flatMap((day) => day[rule.outcome] === null ? [] : [{ date: day.date, value: Number(day[rule.outcome]) }]);
    return spearmanCorrelation(x, y, rule.lagDays).coefficient;
  });
  const stable = halfCoefficients.every((value) => value !== null && Math.sign(value) === Math.sign(result.coefficient!));
  const confidence = confidenceFor(result.sampleSize, stable, Math.abs(result.coefficient));
  const outcomeLabel = outcomeLabels[rule.outcome] ?? String(rule.outcome);
  const direction = result.coefficient > 0 ? "higher" : "lower";
  return {
    id: `correlation-${rule.predictor}-${rule.outcome}-${rule.lagDays}`,
    kind: "correlation",
    title: `Higher ${rule.predictorLabel} ↔ ${direction} ${outcomeLabel}`,
    description: `Your recorded ${outcomeLabel} ${result.coefficient > 0 ? "tended to be higher" : "tended to be lower"} when ${rule.predictorLabel} was higher.`,
    evidence: `${result.sampleSize} paired days · ρ ${result.coefficient > 0 ? "+" : ""}${result.coefficient.toFixed(2)}${rule.lagDays ? " · next day" : " · same day"}`,
    effect: result.coefficient,
    effectUnit: "points",
    coefficient: result.coefficient,
    sampleSize: result.sampleSize,
    lagDays: rule.lagDays,
    confidence,
    stable,
    score: Math.abs(result.coefficient) * Math.log2(result.sampleSize) * (stable ? 0.9 : 0.45),
    predictor: rule.predictor,
    outcome: rule.outcome,
  };
}

export function analyzePersonalLab(observations: LabObservation[]) {
  const ordered = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const thresholds = thresholdRules.flatMap((rule) => {
    const discovery = thresholdDiscovery(rule, ordered);
    return discovery ? [discovery] : [];
  });
  const correlations = correlationPredictors.flatMap(({ predictor, predictorLabel }) => correlationOutcomes.flatMap((outcome) => {
    if (predictor === outcome) return [];
    const discovery = correlationDiscovery({ predictor, predictorLabel, outcome, lagDays: 0 }, ordered);
    return discovery ? [discovery] : [];
  }));
  const discoveries = [...thresholds, ...correlations]
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.predictor === item.predictor && candidate.outcome === item.outcome) === index);
  return {
    discoveries,
    testedCount: thresholdRules.length + correlationPredictors.length * correlationOutcomes.length,
    eligibleCount: discoveries.length,
  };
}
