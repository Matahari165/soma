import { NextResponse } from "next/server";
import { z } from "zod";

import { createMealInputSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { legacyAnalysisToStructured, mealToApi, mealToLegacyApi } from "@/services/meal-api";
import { createPreviewMeal, listPreviewMeals } from "@/services/meal-preview";
import { createMeal, listMeals, MealServiceError, updateMealRecord } from "@/services/meals";

const listQuerySchema = z.object({
  date: z.iso.date().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

function serviceError(error: unknown) {
  if (!(error instanceof MealServiceError)) return NextResponse.json({ error: "Meals are temporarily unavailable." }, { status: 500 });
  const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
  return NextResponse.json({ error: error.message }, { status });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({ date: url.searchParams.get("date") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)) {
    return NextResponse.json({ error: "The meal date range is invalid." }, { status: 400 });
  }
  const range = parsed.data.date ? { from: parsed.data.date, to: parsed.data.date } : { from: parsed.data.from, to: parsed.data.to };
  if (isLocalPreviewMode()) {
    const meals = listPreviewMeals(user.id, range);
    if (parsed.data.date) return NextResponse.json({ date: parsed.data.date, meals: Object.fromEntries(["breakfast", "lunch", "dinner", "snack"].map((slot) => { const meal = meals.find((candidate) => candidate.mealType === slot); return [slot, meal ? mealToLegacyApi(meal) : null]; })), preview: true });
    return NextResponse.json({ meals: meals.map(mealToApi), preview: true });
  }
  try {
    const meals = await listMeals(user.id, range);
    if (parsed.data.date) return NextResponse.json({ date: parsed.data.date, meals: Object.fromEntries(["breakfast", "lunch", "dinner", "snack"].map((slot) => { const meal = meals.find((candidate) => candidate.mealType === slot); return [slot, meal ? mealToLegacyApi(meal) : null]; })) }, { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ meals: meals.map(mealToApi) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return serviceError(error);
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { meal?: Record<string, unknown> } | null;
  const rawMeal = body?.meal;
  const mealId = typeof rawMeal?.id === "string" ? rawMeal.id : null;
  const parsedDate = z.iso.date().safeParse(rawMeal?.date);
  const mealDate = parsedDate.success ? parsedDate.data : null;
  const mealType = rawMeal?.slot === "breakfast" || rawMeal?.slot === "lunch" || rawMeal?.slot === "dinner" || rawMeal?.slot === "snack" ? rawMeal.slot : null;
  if (!mealId || !mealDate || !mealType) return NextResponse.json({ error: "The meal is invalid." }, { status: 400 });
  const status = rawMeal?.status === "confirmed" ? "confirmed" : "draft";
  const mouthHeat = rawMeal?.mouthHeat === null || rawMeal?.mouthHeat === undefined ? null : rawMeal.mouthHeat;
  const stomachLoad = rawMeal?.stomachLoad === null || rawMeal?.stomachLoad === undefined ? null : rawMeal.stomachLoad;
  const validFeeling = (value: unknown) => value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5);
  if (!validFeeling(mouthHeat) || !validFeeling(stomachLoad)) return NextResponse.json({ error: "The meal feelings must be between 0 and 5." }, { status: 400 });
  const confirmedAnalysis = rawMeal?.analysis ? legacyAnalysisToStructured(rawMeal.analysis) : null;
  if (rawMeal?.analysis && !confirmedAnalysis) return NextResponse.json({ error: "The meal analysis is invalid." }, { status: 400 });
  if (isLocalPreviewMode()) {
    const { findPreviewMeal, updatePreviewMeal } = await import("@/services/meal-preview");
    const current = findPreviewMeal(user.id, mealId);
    if (!current) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
    try {
      const updated = updatePreviewMeal(user.id, mealId, { mealDate, mealType, status, mouthWarmthIntensity: typeof mouthHeat === "number" ? mouthHeat as 1 | 2 | 3 | 4 | 5 : null, stomachOverfullIntensity: typeof stomachLoad === "number" ? stomachLoad as 1 | 2 | 3 | 4 | 5 : null, confirmedAnalysis });
      return NextResponse.json({ meal: mealToLegacyApi(updated as NonNullable<typeof updated>), preview: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal could not be saved." }, { status: 400 });
    }
  }
  try {
    const updated = await updateMealRecord(user.id, mealId, { mealDate, mealType, status, mouthWarmthIntensity: typeof mouthHeat === "number" ? mouthHeat as 1 | 2 | 3 | 4 | 5 : null, stomachOverfullIntensity: typeof stomachLoad === "number" ? stomachLoad as 1 | 2 | 3 | 4 | 5 : null, confirmedAnalysis });
    return NextResponse.json({ meal: mealToLegacyApi(updated) });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const headerKey = request.headers.get("Idempotency-Key") ?? undefined;
  const parsed = createMealInputSchema.safeParse({ ...(body ?? {}), ...(headerKey ? { idempotencyKey: headerKey } : {}) });
  if (!parsed.success) return NextResponse.json({ error: "Check the meal date, slot, and feelings." }, { status: 400 });
  if (isLocalPreviewMode()) {
    try {
      const meal = createPreviewMeal(user.id, parsed.data);
      return NextResponse.json({ meal: mealToApi(meal), created: true, preview: true }, { status: 201 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal could not be created." }, { status: 400 });
    }
  }
  try {
    const result = await createMeal(user.id, parsed.data);
    return NextResponse.json({ meal: mealToApi(result.meal), created: result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return serviceError(error);
  }
}
