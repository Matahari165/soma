import { NextResponse } from "next/server";

import { mealAnalysisRequestSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { analyzePreviewMeal, findPreviewMeal } from "@/services/meal-preview";
import { analyzeMeal, findMeal, MealServiceError } from "@/services/meals";

export const maxDuration = 50;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = mealAnalysisRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "The analysis request is invalid." }, { status: 400 });
  const { id } = await context.params;
  if (isLocalPreviewMode()) {
    try {
      const result = analyzePreviewMeal(user.id, id);
      if (!result) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
      const meal = findPreviewMeal(user.id, id);
      return NextResponse.json({ analysis: result.analysis, fresh: true, meal: meal ? mealToApi(meal) : null, preview: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal analysis is unavailable." }, { status: 400 });
    }
  }
  try {
    const result = await analyzeMeal(user.id, id, parsed.data);
    const meal = await findMeal(user.id, id);
    return NextResponse.json({ analysis: result.analysis, fresh: result.fresh, meal: meal ? mealToApi(meal) : null });
  } catch (error) {
    if (error instanceof MealServiceError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Meal analysis is temporarily unavailable." }, { status: 503 });
  }
}
