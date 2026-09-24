import "server-only";

import { selectMeaningfulRelations, type MatrixRelation } from "@/domain/lab/matrix";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import type { PersonalLabSnapshot } from "./personal-lab-types";

export const LAB_RELATION_HISTORY_SCHEMA_VERSION = 1;
export const LAB_RELATION_METHOD_VERSION = "relations-v2";

type RecordedRelation = {
  key: string;
  predictorId: string;
  outcomeId: string;
  lagDays: number;
  modelType: MatrixRelation["modelType"];
  evaluated: boolean;
  effect: number | null;
  effectConfidenceLow: number | null;
  effectConfidenceHigh: number | null;
  sampleSize: number;
  qValue: number;
  practicalRatio: number;
  stable: boolean;
  shownWithStability: boolean;
  shownWithoutStability: boolean;
  chronologicalBlocks: number;
  blockEffects: Array<number | null>;
  blockSampleSizes: number[];
  trendAdjustedDirectionHeld: boolean;
  outlierAdjustedDirectionHeld: boolean;
  reasons: string[];
};

type PreviousRelation = Pick<RecordedRelation,
  "key" | "predictorId" | "outcomeId" | "lagDays" | "modelType" | "shownWithStability" | "shownWithoutStability">;

type PreviousSnapshot = {
  analysis_date: string;
  window_end_date: string;
  input_revision: string | null;
  method_version: string;
  schema_version: number;
  relations: PreviousRelation[];
  rawRelations: unknown[];
};

function parsePreviousSnapshot(value: unknown): PreviousSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.analysis_date !== "string" || typeof row.method_version !== "string"
    || typeof row.schema_version !== "number" || !Array.isArray(row.relations)) return null;
  const relations: PreviousRelation[] = row.relations.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const relation = entry as Record<string, unknown>;
    if (typeof relation.key !== "string" || typeof relation.predictorId !== "string"
      || typeof relation.outcomeId !== "string" || !Number.isSafeInteger(relation.lagDays)
      || typeof relation.modelType !== "string" || typeof relation.shownWithStability !== "boolean"
      || typeof relation.shownWithoutStability !== "boolean") return [];
    return [{
      key: relation.key,
      predictorId: relation.predictorId,
      outcomeId: relation.outcomeId,
      lagDays: relation.lagDays as number,
      modelType: relation.modelType as MatrixRelation["modelType"],
      shownWithStability: relation.shownWithStability,
      shownWithoutStability: relation.shownWithoutStability,
    }];
  });
  return {
    analysis_date: row.analysis_date,
    window_end_date: typeof row.window_end_date === "string" ? row.window_end_date : "",
    input_revision: typeof row.input_revision === "string" ? row.input_revision : null,
    method_version: row.method_version,
    schema_version: row.schema_version,
    relations,
    rawRelations: row.relations,
  };
}

function relationKey(relation: Pick<MatrixRelation, "predictorId" | "outcomeId" | "lagDays">) {
  return JSON.stringify([relation.predictorId, relation.outcomeId, relation.lagDays]);
}

function visibilityReasons(relation: MatrixRelation, shownWithStability: boolean, shownWithoutStability: boolean) {
  if (shownWithStability) return [];
  const reasons = new Set(relation.exclusionReasons);
  if (relation.excluded) reasons.add("Relation excluded by analysis rules");
  if (relation.coefficient === null) reasons.add("Not enough usable paired data");
  if (relation.qValue >= .05) reasons.add("Adjusted q value is not below 0.05");
  if (relation.practicalRatio < 1) reasons.add("Effect is below the practical threshold");
  if (shownWithoutStability && !relation.stable) reasons.add("Temporal stability criteria are not met");
  if (!shownWithoutStability && relation.featureEligible && relation.practicallyMeaningful && !relation.excluded) {
    reasons.add("Another lag was selected for this pair");
  }
  return [...reasons];
}

function relationRecord(relation: MatrixRelation, shownWithStability: boolean, shownWithoutStability: boolean): RecordedRelation {
  return {
    key: relationKey(relation),
    predictorId: relation.predictorId,
    outcomeId: relation.outcomeId,
    lagDays: relation.lagDays,
    modelType: relation.modelType,
    evaluated: true,
    effect: relation.effect,
    effectConfidenceLow: relation.effectConfidenceLow,
    effectConfidenceHigh: relation.effectConfidenceHigh,
    sampleSize: relation.sampleSize,
    qValue: relation.qValue,
    practicalRatio: relation.practicalRatio,
    stable: relation.stable,
    shownWithStability,
    shownWithoutStability,
    chronologicalBlocks: relation.stability.chronologicalBlocks,
    blockEffects: relation.stability.blockEffects ?? [],
    blockSampleSizes: relation.stability.blockSampleSizes ?? [],
    trendAdjustedDirectionHeld: relation.stability.trendAdjustedDirectionHeld,
    outlierAdjustedDirectionHeld: relation.stability.outlierAdjustedDirectionHeld,
    reasons: visibilityReasons(relation, shownWithStability, shownWithoutStability),
  };
}

/** Record displayed relations and their last known candidates, never the source time series. */
function recordedRelations(matrix: PersonalLabSnapshot["matrix"], previous: PreviousSnapshot | null) {
  const relations = matrix.rows.filter((row) => row.period === 90).flatMap((row) => row.relations);
  const stableSelection = new Set(selectMeaningfulRelations(relations, relations.length).map(relationKey));
  const allSelection = new Set(selectMeaningfulRelations(relations, relations.length, { requireTemporalStability: false }).map(relationKey));
  const previouslyShown = new Set((previous?.relations ?? [])
    .filter((relation) => relation.shownWithStability || relation.shownWithoutStability)
    .map((relation) => relation.key));
  const recorded: RecordedRelation[] = [];
  const evaluatedKeys = new Set<string>();
  for (const relation of relations) {
    const key = relationKey(relation);
    evaluatedKeys.add(key);
    const shownWithStability = stableSelection.has(key);
    const shownWithoutStability = allSelection.has(key);
    if (shownWithStability || shownWithoutStability || previouslyShown.has(key)) {
      recorded.push(relationRecord(relation, shownWithStability, shownWithoutStability));
    }
  }
  for (const previousRelation of previous?.relations ?? []) {
    if (!previouslyShown.has(previousRelation.key) || evaluatedKeys.has(previousRelation.key)) continue;
    recorded.push({
      key: previousRelation.key,
      predictorId: previousRelation.predictorId,
      outcomeId: previousRelation.outcomeId,
      lagDays: previousRelation.lagDays,
      modelType: previousRelation.modelType,
      evaluated: false,
      effect: null,
      effectConfidenceLow: null,
      effectConfidenceHigh: null,
      sampleSize: 0,
      qValue: 1,
      practicalRatio: 0,
      stable: false,
      shownWithStability: false,
      shownWithoutStability: false,
      chronologicalBlocks: 0,
      blockEffects: [],
      blockSampleSizes: [],
      trendAdjustedDirectionHeld: false,
      outlierAdjustedDirectionHeld: false,
      reasons: ["Relation was not evaluated in this snapshot"],
    });
  }
  return recorded;
}

/** One revision-aware snapshot per local calendar day, written only when 90-day analysis is requested. */
export async function saveDailyLabRelationSnapshot(userId: string, snapshot: PersonalLabSnapshot, inputRevision: string | null) {
  if (!snapshot.matrix.rows.some((row) => row.period === 90)) return false;
  const admin = createCloudflareAdminClient();
  const previousResult = await admin.from("lab_relation_snapshots")
    .select("analysis_date,window_end_date,input_revision,method_version,schema_version,relations")
    .eq("user_id", userId)
    .eq("period", 90)
    .lte("analysis_date", snapshot.todayDate)
    .order("analysis_date", { ascending: false })
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousResult.error) throw new Error("Relation history could not be read.");
  const previous = parsePreviousSnapshot(previousResult.data);
  if (inputRevision && previous?.analysis_date === snapshot.todayDate
    && previous.window_end_date === snapshot.matrix.analysisEndDate
    && previous.input_revision === inputRevision
    && previous.method_version === LAB_RELATION_METHOD_VERSION
    && previous.schema_version === LAB_RELATION_HISTORY_SCHEMA_VERSION) return true;

  const relations = recordedRelations(snapshot.matrix, previous);
  if (!inputRevision && previous?.analysis_date === snapshot.todayDate
    && previous.window_end_date === snapshot.matrix.analysisEndDate
    && previous.input_revision === null
    && previous.method_version === LAB_RELATION_METHOD_VERSION
    && previous.schema_version === LAB_RELATION_HISTORY_SCHEMA_VERSION
    && JSON.stringify(previous.rawRelations) === JSON.stringify(relations)) return true;
  const written = await admin.from("lab_relation_snapshots").upsert({
    user_id: userId,
    analysis_date: snapshot.todayDate,
    period: 90,
    window_end_date: snapshot.matrix.analysisEndDate,
    schema_version: LAB_RELATION_HISTORY_SCHEMA_VERSION,
    method_version: LAB_RELATION_METHOD_VERSION,
    input_revision: inputRevision,
    captured_at: new Date().toISOString(),
    shown_with_stability_count: relations.filter((relation) => relation.shownWithStability).length,
    shown_without_stability_count: relations.filter((relation) => relation.shownWithoutStability).length,
    relations,
  }, { onConflict: "user_id,analysis_date,period,method_version" });
  if (written.error) throw new Error("Relation history could not be saved.");
  return true;
}

export async function loadDailyLabRelationSnapshots(userId: string, limit: number) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(180, limit)) : 90;
  const result = await createCloudflareAdminClient().from("lab_relation_snapshots")
    .select("analysis_date,window_end_date,captured_at,method_version,schema_version,shown_with_stability_count,shown_without_stability_count,relations")
    .eq("user_id", userId)
    .eq("period", 90)
    .order("analysis_date", { ascending: false })
    .order("captured_at", { ascending: false })
    .limit(boundedLimit);
  if (result.error) throw new Error("Relation history could not be loaded.");
  return result.data ?? [];
}
