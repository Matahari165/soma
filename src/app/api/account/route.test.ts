import { afterEach, describe, expect, it } from "vitest";

import { previewUser } from "@/lib/local-preview";
import { clearPreviewUserData, createPreviewMeal, listPreviewMeals } from "@/services/meal-preview";
import { clearPreviewMealRecipes, createMealRecipe, listMealRecipes } from "@/services/meal-recipes";
import { DELETE as deleteAccount } from "./route";
import { GET as exportAccount, sanitizeExportRows } from "./export/route";

describe("account export redaction", () => {
  it("excludes the Apple Health sync credential without changing stored profiles", () => {
    const stored = { user_id: "test-user", apple_health_sync_token: "synthetic-test-secret", display_name: "Test" };
    const exported = sanitizeExportRows("profiles", [stored]);

    expect(exported).toEqual([{ user_id: "test-user", display_name: "Test" }]);
    expect(stored.apple_health_sync_token).toBe("synthetic-test-secret");
  });
});

describe("local preview account data", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    clearPreviewUserData(previewUser.id);
    clearPreviewMealRecipes(previewUser.id);
  });

  it("exports and deletes preview meals", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    clearPreviewUserData(previewUser.id);
    const meal = createPreviewMeal(previewUser.id, { mealDate: "2026-09-03", mealType: "lunch", note: "Preview meal" });
    await createMealRecipe(previewUser.id, { name: "Preview recipe" });

    const exported = await exportAccount();
    const body = await exported.json();
    expect(body.meals).toEqual(expect.arrayContaining([expect.objectContaining({ id: meal.id, mealDate: "2026-09-03" })]));

    const deleted = await deleteAccount(new Request("https://soma.example/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY SOMA DATA" }), headers: { "content-type": "application/json" } }));
    expect(deleted.status).toBe(200);
    expect(listPreviewMeals(previewUser.id)).toEqual([]);
    expect(await listMealRecipes(previewUser.id)).toEqual([]);
  });
});
