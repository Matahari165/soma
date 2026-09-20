import { NextResponse } from "next/server";

import { aggregateConfirmedMeals, mealFoodGroupHistory, mealNutritionHistory, type ConfirmedMealRecord } from "@/domain/lab/meals";
import { mealRecipeToView } from "@/domain/meal-recipes";
import { DEFAULT_NUTRITION_TARGETS } from "@/domain/nutrition-targets";
import { type Meal, type MealType } from "@/domain/meals";
import { supplementDefinitionToView, supplementEntryToView } from "@/domain/supplements";
import { buildMealScoreOverview } from "@/domain/scores/meal-overview";
import type { MealSlotState } from "@/domain/scores/meal-balance";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { previewProfile } from "@/lib/local-preview";
import { listMealRecipes } from "@/services/meal-recipes";
import { loadConfirmedMealRecords, listMeals } from "@/services/meals";
import { loadDailyNutritionTargetsForUser } from "@/services/nutrition-targets";
import { listSupplementDefinitions, listSupplementEntries } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIME_ZONE = "Europe/Paris";

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function requestedDate(request: Request, timeZone: string) {
  const value = new URL(request.url).searchParams.get("date");
  if (value === null) return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  return isIsoDate(value) ? value : null;
}

function numberMap(values: Partial<Record<string, number | null>>) {
  const entries: Array<[string, number | null]> = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      entries.push([key, null]);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      entries.push([key, value]);
    }
  }
  return Object.fromEntries(entries);
}

async function profileTimeZone(userId: string) {
  if (isLocalPreviewMode()) return DEFAULT_TIME_ZONE;
  try {
    const result = await createCloudflareAdminClient().from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
    const value = result.data?.timezone;
    if (typeof value !== "string" || !value.trim()) return DEFAULT_TIME_ZONE;
    // Reject malformed IANA values before Intl.DateTimeFormat can abort the request.
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function slotStatesByDate(meals: readonly Meal[]) {
  const states = new Map<string, Partial<Record<MealType, MealSlotState>>>();
  for (const meal of meals) {
    const bySlot = states.get(meal.mealDate) ?? {};
    bySlot[meal.mealType] = meal.entryState === "skipped" ? "skipped" : "recorded";
    states.set(meal.mealDate, bySlot);
  }
  return states;
}

function goalMode(value: unknown): "build_muscle" | "maintain" {
  return value === "build_muscle" ? "build_muscle" : "maintain";
}

async function loadGoalMode(userId: string) {
  if (isLocalPreviewMode()) return goalMode(previewProfile.primaryGoal);
  try {
    const result = await createCloudflareAdminClient()
      .from("health_goals")
      .select("goal_type")
      .eq("user_id", userId)
      .eq("priority", 1)
      .is("ended_on", null)
      .maybeSingle();
    return goalMode(result.data?.goal_type);
  } catch {
    return "maintain" as const;
  }
}

function fallbackTargetState() {
  return {
    targets: DEFAULT_NUTRITION_TARGETS,
    effectiveTargets: DEFAULT_NUTRITION_TARGETS,
    persisted: false,
    effortScore: null,
    effortCoverage: null,
    averageEffortScore: null,
    effortThreshold: 40,
    effortSupplementKcal: 0,
    effortAdjustmentApplied: false,
  };
}

function scorePayload(score: ReturnType<typeof buildMealScoreOverview>["balanceScore"]) {
  if (!score) return null;
  return {
    algorithmVersion: score.algorithmVersion,
    value: score.score,
    rawValue: score.rawScore,
    status: score.status,
    confidence: score.confidence,
    observedDimensions: score.observedDimensions,
    components: score.components,
    strongestEffects: score.strongestEffects,
    reasons: score.reasons,
  };
}

function trendPayload(point: ReturnType<typeof buildMealScoreOverview>["scoreTrend"][number]) {
  return {
    date: point.date,
    value: point.balanceScore,
    rawValue: point.rawBalanceScore,
    status: point.balanceStatus,
    confidence: point.balanceConfidence,
    dimensionScores: numberMap(point.dimensionScores),
    dimensionAdjustedScores: numberMap(point.dimensionAdjustedScores),
  };
}

function emptySupplements() {
  return { definitions: [], entries: [] };
}

export async function GET(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });

  const timezone = await profileTimeZone(user.id);
  const date = requestedDate(request, timezone);
  if (!date) return NextResponse.json({ error: "Expected a valid ISO date." }, { status: 400, headers: noStore });

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") ?? "30");
  const days = [7, 14, 30].includes(requestedDays) ? requestedDays : 30;
  const from = addDays(date, -(days - 1));
  const records = await loadConfirmedMealRecords(user.id, { from, to: date });
  const meals = await listMeals(user.id, { from, to: date });
  const targetsResult = await loadDailyNutritionTargetsForUser(user.id, date).catch(() => fallbackTargetState());
  const goal = await loadGoalMode(user.id);
  const states = slotStatesByDate(meals);
  const overview = buildMealScoreOverview({
    records,
    targets: targetsResult.effectiveTargets,
    date,
    goalMode: goal,
    slotStatesByDate: states,
  });
  const aggregates = aggregateConfirmedMeals(records);
  const supplementErrors: Array<{ section: string; message: string }> = [];
  const [definitionResult, entryResult, recipeResult] = await Promise.allSettled([
    listSupplementDefinitions(user.id),
    listSupplementEntries(user.id, { from: date, to: date }),
    listMealRecipes(user.id),
  ]);
  const supplements = {
    definitions: definitionResult.status === "fulfilled" ? definitionResult.value.map(supplementDefinitionToView) : [],
    entries: entryResult.status === "fulfilled" ? entryResult.value.map(supplementEntryToView) : [],
  };
  if (definitionResult.status === "rejected") supplementErrors.push({ section: "supplements", message: "Les définitions de compléments sont momentanément indisponibles." });
  if (entryResult.status === "rejected") supplementErrors.push({ section: "supplementEntries", message: "Les prises de compléments sont momentanément indisponibles." });
  const recipes = recipeResult.status === "fulfilled" ? recipeResult.value.map(mealRecipeToView) : [];
  if (recipeResult.status === "rejected") supplementErrors.push({ section: "recipes", message: "Les recettes personnelles sont momentanément indisponibles." });

  return NextResponse.json({
    date,
    timezone,
    period: { from, to: date, days },
    score: scorePayload(overview.balanceScore),
    rolling: overview.rolling,
    scoreTrend: overview.scoreTrend.slice(-days).map(trendPayload),
    daily: aggregates.find((day) => day.date === date) ?? null,
    nutritionHistory: mealNutritionHistory(records, date, days),
    foodGroupHistory: mealFoodGroupHistory(records, date, days),
    targets: {
      base: targetsResult.targets,
      effective: targetsResult.effectiveTargets,
      persisted: targetsResult.persisted,
      effortScore: targetsResult.effortScore,
      effortCoverage: targetsResult.effortCoverage,
      averageEffortScore: targetsResult.averageEffortScore,
      effortThreshold: targetsResult.effortThreshold,
      effortSupplementKcal: targetsResult.effortSupplementKcal,
      effortAdjustmentApplied: targetsResult.effortAdjustmentApplied,
    },
    supplements: supplements ?? emptySupplements(),
    recipes,
    provenance: {
      source: "confirmed_meals",
      calculation: "soma",
      from,
      to: date,
      confirmedMealCount: records.filter((record: ConfirmedMealRecord) => record.status === "confirmed" && record.entryState !== "skipped").length,
      measuredDays: aggregates.length,
      note: "Les repas confirmés sont la source des totaux ; une journée non renseignée reste vide et ne vaut jamais zéro.",
    },
    errors: supplementErrors,
  }, { headers: noStore });
}
