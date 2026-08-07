import { mean, standardDeviation } from "@/domain/scores/baseline";

export type MetricObservation = {
  date: string;
  value: number;
};

export type GeneratedInsight = {
  category: "positive" | "attention" | "information";
  type: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
  deduplicationKey: string;
};

function sustainedChange(input: {
  observations: MetricObservation[];
  direction: "higher" | "lower";
  metric: string;
  title: string;
  positiveWhenChanged?: boolean;
  unit: string;
}) {
  if (input.observations.length < 17) return null;
  const recent = input.observations.slice(-3);
  const baseline = input.observations.slice(-33, -3).map((point) => point.value);
  if (baseline.length < 14) return null;
  const baselineMean = mean(baseline);
  const deviation = standardDeviation(baseline);
  const recentMean = mean(recent.map((point) => point.value));
  const delta = recentMean - baselineMean;
  const z = deviation ? delta / deviation : 0;
  const changed = input.direction === "higher" ? z >= 1.5 : z <= -1.5;
  if (!changed) return null;
  const percentage = baselineMean ? Math.round(Math.abs((delta / baselineMean) * 100)) : 0;
  const category = input.positiveWhenChanged ? "positive" : "attention";
  return {
    category,
    type: `${input.metric}_${input.direction}`,
    title: input.title,
    description: `Your three-day average is ${percentage}% ${input.direction} than your recent baseline.`,
    evidence: {
      recentAverage: Math.round(recentMean * 10) / 10,
      baselineAverage: Math.round(baselineMean * 10) / 10,
      unit: input.unit,
      zScore: Math.round(z * 100) / 100,
      sampleSize: baseline.length,
    },
    confidence: Math.min(0.95, 0.65 + baseline.length / 100),
    deduplicationKey: `${input.metric}:${input.direction}:${recent.at(-1)?.date}`,
  } satisfies GeneratedInsight;
}

export function generateHealthInsights(input: {
  restingHeartRate: MetricObservation[];
  hrv: MetricObservation[];
  sleepMinutes: MetricObservation[];
}) {
  const candidates = [
    sustainedChange({ observations: input.restingHeartRate, direction: "higher", metric: "resting_heart_rate", title: "Resting heart rate has been elevated", unit: "bpm" }),
    sustainedChange({ observations: input.hrv, direction: "lower", metric: "hrv", title: "HRV has been below your usual range", unit: "ms" }),
    sustainedChange({ observations: input.hrv, direction: "higher", metric: "hrv", title: "HRV has improved", unit: "ms", positiveWhenChanged: true }),
    sustainedChange({ observations: input.sleepMinutes, direction: "lower", metric: "sleep_duration", title: "Sleep duration has been shorter", unit: "minutes" }),
    sustainedChange({ observations: input.sleepMinutes, direction: "higher", metric: "sleep_duration", title: "Sleep duration has improved", unit: "minutes", positiveWhenChanged: true }),
  ];

  return candidates.filter((insight) => insight !== null) as GeneratedInsight[];
}
