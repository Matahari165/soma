import "server-only";

import {
  DEFAULT_NUTRITION_TARGETS,
  parseNutritionTargets,
  type NutritionTargets,
} from "@/domain/nutrition-targets";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";

type TargetRow = {
  user_id: string;
  targets?: unknown;
  updated_at?: string;
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
    surplusKcal: targets.surplusKcal,
  };
}
