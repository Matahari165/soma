import { afterEach, describe, expect, it, vi } from "vitest";

import { createXaiMealVisionProvider } from "./meal-vision";

function structuredAnalysis() {
  const range = { low: 400, likely: 500, high: 650 };
  return {
    summary: "A bowl with grains, vegetables, and a protein source.",
    foods: [{ name: "Rice", preparation: "cooked", portion: "one bowl", estimatedGrams: 250, calories: range, proteinGrams: { low: 5, likely: 7, high: 10 }, carbohydrateGrams: { low: 60, likely: 75, high: 90 }, fatGrams: { low: 1, likely: 3, high: 6 }, fiberGrams: { low: 2, likely: 4, high: 6 }, confidence: "medium" }],
    totals: { calories: range, proteinGrams: { low: 20, likely: 28, high: 36 }, carbohydrateGrams: { low: 65, likely: 80, high: 100 }, fatGrams: { low: 12, likely: 18, high: 25 }, fiberGrams: { low: 4, likely: 7, high: 10 } },
    confidence: "medium",
    uncertainties: ["The amount of oil is not visible."],
  };
}

describe("xAI meal vision contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.XAI_API_KEY;
    delete process.env.XAI_MEAL_VISION_MODEL;
  });

  it("sends all photos in one structured vision request and keeps likely values", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VISION_MODEL = "grok-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const result = await createXaiMealVisionProvider().analyze({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: null,
      images: [
        { id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([1, 2, 3]).buffer },
        { id: "photo-2", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([4, 5, 6]).buffer },
      ],
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; store: boolean; input: Array<{ content: Array<{ type: string; image_url?: string }> }>; text: { format: { type: string; name: string; strict: boolean } } };
    expect(body).toMatchObject({ model: "grok-test", store: false, text: { format: { type: "json_schema", name: "soma_meal_analysis", strict: true } } });
    expect(body.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(2);
    expect(body.input[0]?.content[1]?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(result.totals.calories?.likely).toBe(500);
  });

  it("rejects an invalid provider response instead of persisting guesses", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ summary: "bad", foods: [], totals: {}, confidence: "medium", uncertainties: [] }) }] }] }), { status: 200 }));
    await expect(createXaiMealVisionProvider().analyze({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] })).rejects.toThrow("invalid structured meal analysis");
  });
});
