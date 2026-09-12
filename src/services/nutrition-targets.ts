import "server-only";

import {
  DEFAULT_NUTRITION_TARGETS,
  effortTargetAdjustment,
  nutritionTargetsForEffort,
  parseNutritionTargets,
  type EffortTargetContext,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { previewScoreHistory } from "@/lib/local-preview";

type TargetRow = {
  user_id: string;
  targets?: unknown;
  updated_at?: string;
};

type EffortScoreRow = {
  score_date: string;
  kind?: string;
  score?: unknown;
  drivers?: unknown;
};

export type DailyNutritionTargetState = {
  targets: NutritionTargets;
  effectiveTargets: NutritionTargets;
  persisted: boolean;
  effortScore: number | null;
  effortCoverage: number | null;
  averageEffortScore: number | null;
  effortThreshold: number;
  effortSupplementKcal: number;
  effortAdjustmentApplied: boolean;
};

// The preview has no D1 binding. Keeping the map server-side gives the local
// UI the same read-after-write behaviour as the production endpoint without
// writing personal data into the browser or the repository.
const previewTargets = new Map<string, NutritionTargets>();

export function nutritionTargetsFromRow(row: unknown): NutritionTargets {
  if (!row || typeof row !== "object") return DEFAULT_NUTRITION_TARGETS;
  const value = row as TargetRow;
  return parseNutritionTargets(value.targets) ?? DEFAULT_NUTRITION_TARGETS;
}

export async function loadNutritionTargetsStateForUser(userId: string): Promise<{ targets: NutritionTargets; persisted: boolean }> {
  if (isLocalPreviewMode()) return { targets: previewTargets.get(userId) ?? DEFAULT_NUTRITION_TARGETS, persisted: previewTargets.has(userId) };
  const result = await createCloudflareAdminClient()
    .from("nutrition_targets")
    .select("targets")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error("Nutrition targets could not be loaded.");
  return { targets: nutritionTargetsFromRow(result.data), persisted: Boolean(result.data) };
}

export async function loadNutritionTargetsForUser(userId: string): Promise<NutritionTargets> {
  return (await loadNutritionTargetsStateForUser(userId)).targets;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function nullableNumber(value: unknown): number | null {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function coverageFromRow(row: EffortScoreRow | undefined): number | null {
  if (!row?.drivers || typeof row.drivers !== "object" || Array.isArray(row.drivers)) return null;
  const coverage = nullableNumber((row.drivers as Record<string, unknown>).coverage);
  return coverage !== null && coverage >= 0 && coverage <= 1 ? coverage : null;
}

function contextFromEffortRows(rows: readonly EffortScoreRow[], date: string): EffortTargetContext {
  const effortRows = rows.filter((row) => row.kind === undefined || row.kind === "effort");
  const current = effortRows.find((row) => row.score_date === date);
  const recent = effortRows.filter((row) => row.score_date >= addDays(date, -29) && row.score_date <= date);
  const scores = recent.map((row) => nullableNumber(row.score)).filter((value): value is number => value !== null);
  return {
    effortScore: nullableNumber(current?.score),
    effortCoverage: coverageFromRow(current),
    averageEffortScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
  };
}

function previewEffortRows(date: string): EffortScoreRow[] {
  return previewScoreHistory.effort.map((score, index) => ({
    score_date: addDays(date, index - previewScoreHistory.effort.length + 1),
    kind: "effort",
    score,
    drivers: { coverage: 1 },
  }));
}

export async function loadDailyNutritionTargetsForUser(userId: string, date: string): Promise<DailyNutritionTargetState> {
  const statePromise = loadNutritionTargetsStateForUser(userId);
  const rowsPromise: Promise<EffortScoreRow[]> = isLocalPreviewMode()
    ? Promise.resolve(previewEffortRows(date))
    : Promise.resolve(createCloudflareAdminClient()
      .from("daily_scores")
      .select("score_date,kind,score,drivers")
      .eq("user_id", userId)
      .eq("kind", "effort")
      .gte("score_date", addDays(date, -29))
      .lte("score_date", date)
      .order("score_date", { ascending: true })
      .then((result) => {
        if (result.error) throw new Error("Effort scores could not be loaded.");
        return (result.data ?? []) as EffortScoreRow[];
      }));
  const [state, rows] = await Promise.all([statePromise, rowsPromise]);
  const context = contextFromEffortRows(rows, date);
  const adjustment = effortTargetAdjustment(context);
  return {
    ...state,
    effectiveTargets: nutritionTargetsForEffort(state.targets, context),
    effortScore: context.effortScore,
    effortCoverage: context.effortCoverage,
    averageEffortScore: context.averageEffortScore,
    effortThreshold: adjustment.threshold,
    effortSupplementKcal: adjustment.supplementKcal,
    effortAdjustmentApplied: adjustment.applied,
  };
}

export async function saveNutritionTargetsForUser(userId: string, targets: NutritionTargets): Promise<NutritionTargets> {
  const parsed = parseNutritionTargets(targets);
  if (!parsed) throw new Error("Nutrition targets are invalid.");
  if (isLocalPreviewMode()) {
    previewTargets.set(userId, parsed);
    return parsed;
  }
  const now = new Date().toISOString();
  const result = await createCloudflareAdminClient()
    .from("nutrition_targets")
    .upsert({ user_id: userId, targets: parsed, created_at: now, updated_at: now }, { onConflict: "user_id" })
    .select("targets")
    .single();
  if (result.error || !result.data) throw new Error("Nutrition targets could not be saved.");
  return nutritionTargetsFromRow(result.data);
}

export function nutritionTargetLikelyValues(targets: NutritionTargets) {
  return {
    caloriesKcal: targets.caloriesKcal.likely,
    proteinG: targets.proteinG.likely,
    fatG: targets.fatG.likely,
    carbsG: targets.carbsG.likely,
    fiberG: targets.fiberG.likely,
    addedSugarG: targets.addedSugarG.likely,
    surplusKcal: targets.surplusKcal,
  };
}
