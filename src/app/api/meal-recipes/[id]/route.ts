import { NextResponse } from "next/server";

import { mealRecipeToView, mealRecipeUpdateSchema } from "@/domain/meal-recipes";
import { getCurrentUser } from "@/lib/auth";
import { deleteMealRecipe, findMealRecipe, MealRecipeServiceError, updateMealRecipe } from "@/services/meal-recipes";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof MealRecipeServiceError)) return NextResponse.json({ error: "Les recettes personnelles sont momentanément indisponibles." }, { status: 500, headers: noStore });
  const status = error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStore });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const { id } = await context.params;
  try {
    const recipe = await findMealRecipe(user.id, id);
    return recipe
      ? NextResponse.json({ recipe: mealRecipeToView(recipe) }, { headers: noStore })
      : NextResponse.json({ error: "Recette personnelle introuvable.", code: "not_found" }, { status: 404, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = mealRecipeUpdateSchema.safeParse(body?.recipe ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La modification de la recette est invalide." }, { status: 400, headers: noStore });
  const { id } = await context.params;
  try {
    const recipe = await updateMealRecipe(user.id, id, parsed.data);
    if (!recipe) return NextResponse.json({ error: "Recette personnelle introuvable.", code: "not_found" }, { status: 404, headers: noStore });
    return NextResponse.json({ recipe: mealRecipeToView(recipe) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const { id } = await context.params;
  try {
    await deleteMealRecipe(user.id, id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
