import type { MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

export type GroupedMatrixRow = {
  id: string;
  label: string;
  emoji: string | null;
  relationsByOutcome: MatrixRelation[][];
};

export function groupMatrixRows(
  rows: PersonalLabSnapshot["matrix"]["rows"],
  outcomeIds: readonly string[],
  showNonSignificant: boolean,
) {
  const grouped = new Map<string, GroupedMatrixRow>();
  for (const row of rows) {
    const predictorId = row.relations[0]?.predictorId;
    if (!predictorId) continue;
    const current = grouped.get(predictorId) ?? {
      id: predictorId,
      label: row.label,
      emoji: row.emoji,
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
  })).filter((row) => row.relationsByOutcome.some((relations) => showNonSignificant
    ? relations.some((relation) => !relation.excluded)
    : relations.some((relation) => relation.featureEligible && relation.qValue < .05)));
}

export function calculableRelations(relations: MatrixRelation[]) {
  return relations.filter((relation) => !relation.excluded && relation.coefficient !== null);
}

export function significantRelations(relations: MatrixRelation[]) {
  return calculableRelations(relations).filter((relation) => relation.featureEligible && relation.qValue < .05);
}
