import type { MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

export type GroupedMatrixRow = {
  id: string;
  label: string;
  emoji: string | null;
  journal: boolean;
  group: string;
  relationsByOutcome: MatrixRelation[][];
};

const activityLoadIds = new Set(["effort", "zone_minutes", "intense_minutes", "exercise_minutes", "active_minutes"]);
const sleepPatternIds = new Set(["bedtime", "wake_time", "sleep_regularity", "sleep_debt"]);
const influenceGroupOrder = ["Sleep pattern", "Daily movement", "Activity load", "Other influences", "Journal habits"];

export function influenceGroup(predictorId: string) {
  if (predictorId.startsWith("journal:")) return "Journal habits";
  if (activityLoadIds.has(predictorId)) return "Activity load";
  if (predictorId === "steps") return "Daily movement";
  if (sleepPatternIds.has(predictorId)) return "Sleep pattern";
  return "Other influences";
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

export function calculableRelations(relations: MatrixRelation[]) {
  return relations.filter((relation) => !relation.excluded && relation.coefficient !== null);
}

export function significantRelations(relations: MatrixRelation[]) {
  return calculableRelations(relations).filter((relation) => relation.featureEligible && relation.qValue < .05);
}
