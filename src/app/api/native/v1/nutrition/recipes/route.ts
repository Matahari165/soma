import { NextResponse } from "next/server";

import { mealRecipeInputSchema, mealRecipeToView } from "@/domain/meal-recipes";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { createMealRecipe, listMealRecipes, MealRecipeServiceError } from "@/services/meal-recipes";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof MealRecipeServiceError)) {
    return NextResponse.json({ error: "Les recettes personnelles sont momentanément indisponibles." }, { status: 500, headers: noStore });
  }
  const status = error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStore });
}

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json({ recipes: (await listMealRecipes(user.id)).map(mealRecipeToView) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function POST(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = mealRecipeInputSchema.safeParse(body?.recipe ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La recette est invalide." }, { status: 400, headers: noStore });
  try {
    const recipe = await createMealRecipe(user.id, parsed.data);
    return NextResponse.json({ recipe: mealRecipeToView(recipe) }, { status: 201, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
