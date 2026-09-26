import { isPersonalLabMetricAllowed, isPersonalLabPublishedRelation, type MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

export type GroupedMatrixRow = {
  id: string;
  label: string;
  emoji: string | null;
  journal: boolean;
  group: string;
  relationsByOutcome: MatrixRelation[][];
};

const activityLoadIds = new Set(["effort", "zone_minutes", "intense_minutes", "exercise_minutes", "running_distance", "running_pace", "running_average_heart_rate", "vo2_max", "run_day"]);
const dailyActivityIds = new Set(["steps", "active_minutes", "sedentary_minutes", "active_day"]);
const sleepPatternIds = new Set(["bedtime", "wake_time", "sleep_regularity", "sleep_debt", "sleep_minutes"]);
const influenceGroupOrder = ["Rythme du sommeil", "Activité quotidienne", "Entraînement et course", "Autres influences", "Habitudes du journal"];

export function influenceGroup(predictorId: string) {
  if (predictorId.startsWith("journal:")) return "Habitudes du journal";
  if (dailyActivityIds.has(predictorId)) return "Activité quotidienne";
  if (activityLoadIds.has(predictorId)) return "Entraînement et course";
  if (sleepPatternIds.has(predictorId)) return "Rythme du sommeil";
  return "Autres influences";
}

export function compareInfluenceGroups(first: string, second: string) {
  return influenceGroupOrder.indexOf(first) - influenceGroupOrder.indexOf(second);
}

export function groupMatrixRows(
  rows: PersonalLabSnapshot["matrix"]["rows"],
  outcomeIds: readonly string[],
) {
  const grouped = new Map<string, GroupedMatrixRow>();
  for (const row of rows) {
    const predictorId = row.relations[0]?.predictorId;
    if (!predictorId) continue;
    const current = grouped.get(predictorId) ?? {
      id: predictorId,
      label: row.label,
      emoji: row.emoji,
      journal: row.relations.some((relation) => relation.family === "journal-acute" || relation.family === "journal-chronic"),
      group: influenceGroup(predictorId),
      relationsByOutcome: outcomeIds.map(() => []),
    };
    row.relations.forEach((relation) => {
      const outcomeIndex = outcomeIds.indexOf(relation.outcomeId);
      if (outcomeIndex >= 0) current.relationsByOutcome[outcomeIndex].push(relation);
    });
    grouped.set(predictorId, current);
  }

  return [...grouped.values()].map((row) => ({
    ...row,
    relationsByOutcome: row.relationsByOutcome.map((relations) => [...relations].sort((first, second) => first.lagDays - second.lagDays)),
  })).sort((first, second) => compareInfluenceGroups(first.group, second.group));
}

type CalculableRelation = Pick<MatrixRelation, "predictorId" | "outcomeId" | "excluded" | "coefficient">;
type SignificantRelation = CalculableRelation & Pick<MatrixRelation, "featureEligible" | "qValue" | "practicallyMeaningful" | "stable">;

export function calculableRelations<T extends CalculableRelation>(relations: T[]) {
  return relations.filter((relation) => isPersonalLabMetricAllowed(relation.predictorId)
    && isPersonalLabMetricAllowed(relation.outcomeId)
    && !relation.excluded
    && relation.coefficient !== null);
}

export function significantRelations<T extends SignificantRelation>(relations: T[]) {
  return calculableRelations(relations).filter((relation) => isPersonalLabPublishedRelation(relation));
}

/**
 * Keeps effects with the same comparison together so the threshold/dose is
 * written once while every outcome keeps its own visual estimate.
 */
export type RelationComparisonGroup<T extends Pick<MatrixRelation, "comparisonLabel"> = MatrixRelation> = {
  comparisonLabel: string;
  relations: T[];
};

export function groupRelationsByComparison<T extends Pick<MatrixRelation, "comparisonLabel">>(relations: readonly T[]): RelationComparisonGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const relation of relations) {
    const current = grouped.get(relation.comparisonLabel) ?? [];
    current.push(relation);
    grouped.set(relation.comparisonLabel, current);
  }
  return [...grouped.entries()].map(([comparisonLabel, groupedRelations]) => ({
    comparisonLabel,
    relations: groupedRelations,
  }));
}
