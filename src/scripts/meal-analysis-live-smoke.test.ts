import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateMealAnalysis, type MealType } from "@/domain/meals";
import { analyzeMealInputWithFallback } from "@/integrations/meal-analysis/provider-chain";
import type { MealVisionImage } from "@/integrations/xai/meal-vision";

const live = process.env.MEAL_ANALYSIS_LIVE_SMOKE === "1"
  && process.env.MEAL_ANALYSIS_LIVE_CONFIRM === "YES"
  && process.env.CI !== "true";

async function fixtureImage(id: string): Promise<MealVisionImage> {
  const bytes = await readFile(resolve(process.cwd(), "tests/fixtures/meal-analysis-live/plate.jpg"));
  return {
    id,
    mimeType: "image/jpeg",
    origin: "homemade",
    data: new Uint8Array(bytes).buffer,
  };
}

const cases: Array<{ name: string; mealType: MealType; note: string | null; imageIds: string[] }> = [
  {
    name: "text-only",
    mealType: "lunch",
    note: "Une assiette de riz, poulet grillé, brocoli et un filet d'huile d'olive.",
    imageIds: [],
  },
  { name: "photo-only", mealType: "snack", note: null, imageIds: ["photo-only-1"] },
  {
    name: "text-and-photo",
    mealType: "dinner",
    note: "Soupe de légumes avec deux tartines au fromage.",
    imageIds: ["combined-1"],
  },
  {
    name: "two-photos",
    mealType: "dinner",
    note: "Deux vues du même repas.",
    imageIds: ["two-1", "two-2"],
  },
  {
    name: "multiple-photos",
    mealType: "breakfast",
    note: "Yaourt nature, banane, flocons d'avoine et quelques noix répartis sur les photos.",
    imageIds: ["multi-1", "multi-2", "multi-3"],
  },
];

describe.skipIf(!live).sequential("meal analysis provider live smoke", () => {
  for (const fixture of cases) {
    it(`completes ${fixture.name} through the configured provider chain`, async () => {
      const startedAt = Date.now();
      const images = await Promise.all(fixture.imageIds.map(fixtureImage));
      const analysed = await analyzeMealInputWithFallback({
        mealType: fixture.mealType,
        mealDate: "2026-09-17",
        note: fixture.note,
        images,
        requestId: `live-smoke-${fixture.name}-${crypto.randomUUID()}`,
      });
      const result = validateMealAnalysis(analysed.result, { sourcePhotoIds: images.map((image) => image.id) });

      console.info("[meal-analysis-live-smoke]", {
        scenario: fixture.name,
        durationMs: Date.now() - startedAt,
        provider: analysed.provider,
        model: analysed.model,
        foodCount: result.foods.length,
      });
      expect(result.foods.length).toBeGreaterThan(0);
    }, 4 * 60_000);
  }
});
