import type { AnalysisPeriod, MatrixRelation } from "./matrix";

type StrongestEffectsOutcome = { id: string; label: string; unit: string; direction: "higher" | "lower" | "target" };

/** Fields needed to filter, rank, and render Strongest Effects before a relation is opened. */
export type StrongestEffectsRelation = Pick<MatrixRelation,
  | "predictorId" | "predictorLabel"
  | "outcomeId" | "outcomeLabel" | "outcomeUnit"
  | "coefficient" | "effect" | "effectConfidenceLow" | "effectConfidenceHigh" | "percentEffect"
  | "comparisonLabel" | "modelType" | "sampleSize" | "qValue" | "confidenceLow" | "confidenceHigh" | "relevance"
  | "lagDays" | "grain" | "timeScale" | "period"
  | "stable" | "minimumDaysRemaining" | "practicallyMeaningful" | "practicalThreshold" | "practicalRatio" | "featureEligible" | "excluded"
>;

export type StrongestEffectsResponse = {
  generation: string;
  rows: Array<{
    id: string;
    label: string;
    emoji: string | null;
    grain: "day";
    timeScale: "acute";
    period: AnalysisPeriod;
    lagLabel: string;
    relations: StrongestEffectsRelation[];
  }>;
  outcomes: StrongestEffectsOutcome[];
  periods: AnalysisPeriod[];
};

const relationFields = [
  "predictorId", "predictorLabel",
  "outcomeId", "outcomeLabel", "outcomeUnit",
  "coefficient", "effect", "effectConfidenceLow", "effectConfidenceHigh", "percentEffect", "comparisonLabel", "modelType",
  "sampleSize", "qValue", "confidenceLow", "confidenceHigh", "relevance",
  "lagDays", "grain", "timeScale", "period",
  "stable", "minimumDaysRemaining", "practicallyMeaningful", "practicalThreshold", "practicalRatio", "featureEligible", "excluded",
] as const satisfies readonly (keyof MatrixRelation)[];

export function compactStrongestEffectsRelation(relation: MatrixRelation): StrongestEffectsRelation {
  const compact = Object.fromEntries(relationFields.map((field) => [field, relation[field]]));
  return compact as StrongestEffectsRelation;
}

export function compactStrongestEffectsResponse(
  matrix: {
    rows: Array<{
      id: string;
      label: string;
      emoji: string | null;
      grain: "day";
      timeScale: "acute";
      period: AnalysisPeriod;
      lagLabel: string;
      relations: MatrixRelation[];
    }>;
    outcomes: StrongestEffectsOutcome[];
    periods: readonly AnalysisPeriod[];
  },
  generation: string,
): StrongestEffectsResponse {
  return {
    generation,
    rows: matrix.rows.map((row) => ({
      id: row.id,
      label: row.label,
      emoji: row.emoji,
      grain: row.grain,
      timeScale: row.timeScale,
      period: row.period,
      lagLabel: row.lagLabel,
      relations: row.relations.map(compactStrongestEffectsRelation),
    })),
    outcomes: matrix.outcomes,
    periods: [...matrix.periods],
  };
}

export function parseStrongestEffectsRelationKey(value: string | null) {
  if (!value || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 7) return null;
    const [predictorId, outcomeId, lagDays, grain, timeScale, modelType, comparisonLabel] = parsed;
    if (typeof predictorId !== "string" || predictorId.length < 1 || predictorId.length > 160) return null;
    if (typeof outcomeId !== "string" || outcomeId.length < 1 || outcomeId.length > 160) return null;
    if (typeof lagDays !== "number" || !Number.isInteger(lagDays) || lagDays < 0 || lagDays > 2) return null;
    if (grain !== "day" && grain !== "week") return null;
    if (timeScale !== "acute" && timeScale !== "chronic") return null;
    if (typeof modelType !== "string" || !["binary", "linear", "threshold", "plateau", "optimal-zone", "adverse-zone", "middle-zone"].includes(modelType)) return null;
    if (typeof comparisonLabel !== "string" || comparisonLabel.length > 180) return null;
    return parsed as [string, string, number, "day" | "week", "acute" | "chronic", MatrixRelation["modelType"], string];
  } catch {
    return null;
  }
}
