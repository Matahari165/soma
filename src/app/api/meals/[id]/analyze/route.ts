import { NextResponse } from "next/server";

import { mealAnalysisCorrectionSchema, mealAnalysisRequestSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { analyzePreviewMeal, findPreviewMeal } from "@/services/meal-preview";
import { analyzeMeal, findMeal, MealServiceError } from "@/services/meals";

export const maxDuration = 50;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = mealAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "The analysis request is invalid." }, { status: 400 });
  const correctionValue = body && typeof body === "object" ? (body as Record<string, unknown>).correction : undefined;
  const correction = correctionValue === undefined ? undefined : mealAnalysisCorrectionSchema.safeParse(correctionValue);
  if (correction && !correction.success) return NextResponse.json({ error: "The analysis correction is invalid." }, { status: 400 });
  const analysisOptions = correction?.success ? { ...parsed.data, correction: correction.data } : parsed.data;
  const { id } = await context.params;
  if (isLocalPreviewMode()) {
    try {
      const result = analyzePreviewMeal(user.id, id, correction?.success ? { correction: correction.data } : undefined);
      if (!result) return NextResponse.json({ error: "Meal not found." }, { status: 404 });
      const meal = findPreviewMeal(user.id, id);
      return NextResponse.json({ analysis: result.analysis, fresh: true, meal: meal ? mealToApi(meal) : null, preview: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal analysis is unavailable." }, { status: 400 });
    }
  }
  try {
    const result = await analyzeMeal(user.id, id, analysisOptions);
    const meal = await findMeal(user.id, id);
    return NextResponse.json({ analysis: result.analysis, fresh: result.fresh, meal: meal ? mealToApi(meal) : null });
  } catch (error) {
    if (error instanceof MealServiceError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : error.code === "conflict" ? 409 : 503;
      return NextResponse.json({ error: error.message, code: error.diagnosticCode ?? error.code }, { status });
    }
    return NextResponse.json({ error: "Meal analysis is temporarily unavailable." }, { status: 503 });
  }
}
