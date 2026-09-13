import { afterEach, describe, expect, it, vi } from "vitest";

import { createXaiMealVisionProvider } from "./meal-vision";

function validAnalysis() {
  const range = { low: 100, likely: 150, high: 220 };
  return {
    summary: "Un bol de riz.",
    dishType: null,
    calorieAnalysis: null,
    foods: [{
      name: "Riz",
      preparation: null,
      portion: null,
      estimatedGrams: null,
      kind: "ingredient",
      parentId: null,
      course: null,
      countedInTotals: true,
      foodGroups: ["refined_grain"],
      varietyKey: "riz",
      alcoholic: false,
      novaGroup: null,
      sugarExposure: null,
      qualityProperties: null,
      evidence: "visible",
      evidenceSource: "note",
      evidencePhotoIds: [],
      quantity: null,
      calories: range,
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
      fiberGrams: null,
      sugarGrams: null,
      addedSugarGrams: null,
      confidence: "low",
    }],
    totals: {
      calories: range,
      proteinGrams: null,
      carbohydrateGrams: null,
      fatGrams: null,
      fiberGrams: null,
      sugarGrams: null,
      addedSugarGrams: null,
    },
    confidence: "low",
    uncertainties: ["La portion n'est pas précisée."],
  };
}

describe("meal vision provider regressions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAI_API_KEY;
  });

  it("accepts null quality properties without inventing a descriptive property", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200 }));

    const result = await createXaiMealVisionProvider().analyze({
      mealType: "dinner",
      mealDate: "2026-09-12",
      note: null,
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    });

    expect(result.foods[0]).not.toHaveProperty("qualityProperties");
  });

  it("retries a complete response that fails semantic validation before rejecting it", async () => {
    process.env.XAI_API_KEY = "test-key";
    const invalid = { ...validAnalysis(), summary: "" };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(invalid) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(validAnalysis()) }), { status: 200 }));

    const result = await createXaiMealVisionProvider().analyze({
      mealType: "dinner",
      mealDate: "2026-09-12",
      note: null,
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toBe("Un bol de riz.");
  });
});
