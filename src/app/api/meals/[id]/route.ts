import { NextResponse } from "next/server";

import { updateMealInputSchema } from "@/domain/meals";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { mealToApi } from "@/services/meal-api";
import { deletePreviewMeal, findPreviewMeal, updatePreviewMeal } from "@/services/meal-preview";
import { deleteMeal, findMeal, MealServiceError, updateMealRecord } from "@/services/meals";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (isLocalPreviewMode()) {
    const meal = findPreviewMeal(user.id, id);
    return meal ? NextResponse.json({ meal: mealToApi(meal), preview: true }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
  }
  try {
    const meal = await findMeal(user.id, id);
    return meal ? NextResponse.json({ meal: mealToApi(meal) }, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
  } catch (error) {
    return error instanceof MealServiceError ? NextResponse.json({ error: error.message }, { status: error.code === "not_found" ? 404 : 400 }) : NextResponse.json({ error: "Meal could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateMealInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the meal fields and feelings." }, { status: 400 });
  const { id } = await context.params;
  if (isLocalPreviewMode()) {
    try {
      const meal = updatePreviewMeal(user.id, id, parsed.data);
      return meal ? NextResponse.json({ meal: mealToApi(meal), preview: true }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Meal could not be updated." }, { status: 400 });
    }
  }
  try {
    const meal = await updateMealRecord(user.id, id, parsed.data);
    return NextResponse.json({ meal: mealToApi(meal) });
  } catch (error) {
    if (error instanceof MealServiceError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid" ? 400 : 503;
      return NextResponse.json({ error: error.message, code: error.diagnosticCode ?? error.code }, { status });
    }
    return NextResponse.json({ error: "Meal could not be updated." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (isLocalPreviewMode()) return deletePreviewMeal(user.id, id) ? NextResponse.json({ ok: true, preview: true }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
  try {
    const deleted = await deleteMeal(user.id, id);
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Meal not found." }, { status: 404 });
  } catch (error) {
    return error instanceof MealServiceError ? NextResponse.json({ error: error.message }, { status: 503 }) : NextResponse.json({ error: "Meal could not be deleted." }, { status: 500 });
  }
}
