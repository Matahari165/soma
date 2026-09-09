import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeMealInput, createXaiMealVisionProvider } from "./meal-vision";

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
    delete process.env.XAI_MEAL_VALIDATOR_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MEAL_VALIDATOR_MODEL;
    delete process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT;
  });

  it("sends the note and all photos in one structured vision request", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VISION_MODEL = "grok-test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const result = await createXaiMealVisionProvider().analyze({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      images: [
        { id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([1, 2, 3]).buffer },
        { id: "photo-2", mimeType: "image/jpeg", origin: "homemade", data: Uint8Array.from([4, 5, 6]).buffer },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; store: boolean; input: Array<{ content: Array<{ type: string; text?: string; image_url?: string; detail?: string }> }>; text: { format: { type: string; name: string; strict: boolean } } };
    expect(body).toMatchObject({ model: "grok-test", store: false, text: { format: { type: "json_schema", name: "soma_meal_analysis", strict: true } } });
    expect(body.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(2);
    expect(body.input[0]?.content[0]?.text).toContain("Bol de riz avec légumes");
    expect(body.input[0]?.content[1]?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.input[0]?.content[1]?.detail).toBe("high");
    expect(result.totals.calories?.likely).toBe(500);
  });

  it("extracts JSON wrapped in provider prose and normalizes numeric strings", async () => {
    process.env.XAI_API_KEY = "test-key";
    const wrapped = JSON.stringify(structuredAnalysis())
      .replace('"estimatedGrams":250', '"estimatedGrams":"250"')
      .replace('"low":400,"likely":500,"high":650', '"low":"400","likely":"500","high":"650"');
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: `Voici le résultat :\n\n\`\`\`json\n${wrapped}\n\`\`\`\nFin.` }), { status: 200 }));

    const result = await createXaiMealVisionProvider().analyze({ mealType: "lunch", mealDate: "2026-08-31", note: "Un bol", images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }] });

    expect(result.foods[0]?.estimatedGrams).toBe(250);
    expect(result.totals.calories?.likely).toBe(500);
  });

  it("rejects an invalid provider response instead of persisting guesses", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ summary: "bad", foods: [], totals: {}, confidence: "medium", uncertainties: [] }) }] }] }), { status: 200 }));
    await expect(createXaiMealVisionProvider().analyze({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] })).rejects.toThrow("invalid structured meal analysis");
  });

  it("sends a text-only request without images for a free description", async () => {
    process.env.XAI_API_KEY = "test-key";
    const range = { low: 150, likely: 190, high: 230 };
    const textOnly = {
      summary: "2 bananes, sans photo.",
      dishType: null,
      calorieAnalysis: "Environ 190 kcal (likely), un en-cas modéré.",
      foods: [{ name: "Banane", preparation: null, portion: null, estimatedGrams: null, calories: range, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null, confidence: "low" }],
      totals: { calories: range, proteinGrams: null, carbohydrateGrams: null, fatGrams: null, fiberGrams: null },
      confidence: "low",
      uncertainties: ["Estimation à partir de la seule description, sans photo."],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(textOnly) }] }] }), { status: 200 }));
    const result = await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { max_output_tokens: number; input: Array<{ content: Array<{ type: string; text?: string }> }>; text: { format: { type: string; name: string; strict: boolean } } };
    expect(body).toMatchObject({ max_output_tokens: 1500, text: { format: { type: "json_schema", name: "soma_meal_analysis", strict: true } } });
    expect(body.input[0]?.content.some((item) => item.type === "input_image")).toBe(false);
    expect(body.input[0]?.content[0]?.text).toContain("2 bananes");
    expect(result).toMatchObject({ confidence: "low", totals: { calories: range } });
  });

  it("uses personal recipes only as variable context", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({
      mealType: "dinner",
      mealDate: "2026-08-31",
      note: "Pâtes avec poulet",
      recipeReferences: [{ name: "Pâtes du soir", dishType: "Pâtes", ingredients: [{ name: "Pâtes", usualAmount: "portion variable", alternatives: [] }], aliases: [], commonVariations: [] }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ text?: string }> }> };
    expect(body.input[0]?.content[0]?.text).toContain("Pâtes du soir");
    expect(body.input[0]?.content[0]?.text).toContain("indicatifs");
    expect(body.input[0]?.content[0]?.text).toContain("La photo et la description actuelles priment");
  });

  it("classifies provider failures without exposing the provider payload", async () => {
    process.env.XAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("private provider payload", { status: 429 }));
    await expect(createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" }))
      .rejects.toMatchObject({ code: "provider_rate_limited", message: "Grok est momentanément sollicité. Réessaie dans quelques instants." });
  });

  it("retries an empty Grok response once", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the primary model and validator for a natural-language correction by default", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VISION_MODEL = "grok-primary";
    process.env.XAI_MEAL_VALIDATOR_MODEL = "grok-validator";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const result = await analyzeMealInput({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      correction: "La portion de riz était plus petite que prévu.",
      images: [{ id: "photo-1", mimeType: "image/jpeg", origin: "homemade", data: new Uint8Array([1]).buffer }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const primaryBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { model: string; input: Array<{ content: Array<{ text?: string; detail?: string }> }> };
    const validatorBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { model: string; input: Array<{ content: Array<{ text?: string; detail?: string }> }> };
    expect(primaryBody.model).toBe("grok-primary");
    expect(primaryBody.input[0]?.content[0]?.text).toContain("Bol de riz");
    expect(primaryBody.input[0]?.content[0]?.text).toContain("La portion de riz était plus petite que prévu.");
    expect(primaryBody.input[0]?.content[1]?.detail).toBe("high");
    expect(validatorBody.model).toBe("grok-validator");
    expect(validatorBody.input[0]?.content[0]?.text).toContain("La portion de riz était plus petite que prévu.");
    expect(validatorBody.input[0]?.content[1]?.detail).toBe("high");
    expect(result.result.summary).toBe(structuredAnalysis().summary);
  });

  it("uses GPT-5.6 Sol with low reasoning as the configured validator", async () => {
    process.env.XAI_API_KEY = "xai-test-key";
    process.env.OPENAI_API_KEY = "openai-test-key";
    process.env.OPENAI_MEAL_VALIDATOR_REASONING_EFFORT = "low";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));

    await analyzeMealInput({
      mealType: "lunch",
      mealDate: "2026-08-31",
      note: "Bol de riz avec légumes",
      images: Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, mimeType: "image/jpeg", origin: "homemade" as const, data: new Uint8Array([index + 1]).buffer })),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/responses");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.openai.com/v1/responses");
    const validatorBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { model: string; reasoning: { effort: string }; input: Array<{ content: Array<{ detail?: string }> }> };
    expect(validatorBody).toMatchObject({ model: "gpt-5.6-sol", reasoning: { effort: "low" } });
    expect(validatorBody.input[0]?.content[1]?.detail).toBe("low");
    expect(validatorBody.input[0]?.content.filter((item) => item.detail === "low")).toHaveLength(4);
  });

  it("keeps four photos in one high-detail primary request", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const images = Array.from({ length: 4 }, (_, index) => ({ id: `photo-${index + 1}`, mimeType: "image/jpeg", origin: "homemade" as const, data: new Uint8Array([index + 1]).buffer }));

    await createXaiMealVisionProvider().analyze({ mealType: "dinner", mealDate: "2026-08-31", note: "Repas avec quatre angles", images });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { input: Array<{ content: Array<{ type: string; detail?: string }> }> };
    const imageParts = body.input[0]?.content.filter((item) => item.type === "input_image") ?? [];
    expect(imageParts).toHaveLength(4);
    expect(imageParts.every((item) => item.detail === "high")).toBe(true);
  });

  it("supports every vision count from one through six in one request per meal", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }));
    const provider = createXaiMealVisionProvider();

    for (let count = 1; count <= 6; count += 1) {
      await provider.analyze({
        mealType: "lunch",
        mealDate: "2026-08-31",
        note: count % 2 === 0 ? "Photo avec une note" : null,
        images: Array.from({ length: count }, (_, index) => ({ id: `photo-${count}-${index}`, mimeType: "image/jpeg", origin: "unknown" as const, data: new Uint8Array([index + 1]).buffer })),
      });
    }

    expect(fetchMock).toHaveBeenCalledTimes(6);
    fetchMock.mock.calls.forEach((call, index) => {
      const body = JSON.parse(String(call[1]?.body)) as { input: Array<{ content: Array<{ type: string }> }> };
      expect(body.input[0]?.content.filter((item) => item.type === "input_image")).toHaveLength(index + 1);
    });
  });

  it("reports a missing Grok key as configuration instead of transient unavailability", async () => {
    await expect(createXaiMealVisionProvider().analyzeText!({ mealType: "snack", mealDate: "2026-08-31", note: "2 bananes" }))
      .rejects.toMatchObject({ code: "provider_auth", message: "La configuration de l’analyse Grok est invalide." });
  });

  it("does not add a second Grok request when no validator is configured", async () => {
    process.env.XAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify(structuredAnalysis()) }), { status: 200 }));

    await analyzeMealInput({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the primary result when the default verification fails", async () => {
    process.env.XAI_API_KEY = "test-key";
    process.env.XAI_MEAL_VALIDATOR_MODEL = "grok-validator";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(structuredAnalysis()) }] }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("validator unavailable", { status: 503 }));

    const result = await analyzeMealInput({ mealType: "dinner", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "prepared", data: new Uint8Array([1]).buffer }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result.summary).toBe(structuredAnalysis().summary);
  });

  it("keeps providers without verify compatible", async () => {
    const primary = structuredAnalysis();
    const provider = {
      name: "test",
      model: "test-model",
      analyze: vi.fn().mockResolvedValue(primary),
    };

    const result = await analyzeMealInput({ mealType: "breakfast", mealDate: "2026-08-31", note: null, images: [{ id: "photo-1", mimeType: "image/png", origin: "unknown", data: new Uint8Array([1]).buffer }] }, provider);

    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ result: primary, provider: "test", model: "test-model" });
  });

  it("passes a natural-language correction through the text-only verification path", async () => {
    const primary = structuredAnalysis();
    const correction = "Il y avait aussi un filet d'huile d'olive.";
    const provider = {
      name: "test",
      model: "test-model",
      analyze: vi.fn(),
      analyzeText: vi.fn().mockResolvedValue(primary),
      verify: vi.fn().mockResolvedValue(primary),
    };

    await analyzeMealInput({ mealType: "snack", mealDate: "2026-08-31", note: "Yaourt", correction, images: [] }, provider);

    expect(provider.analyzeText).toHaveBeenCalledWith({ mealType: "snack", mealDate: "2026-08-31", note: "Yaourt", correction });
    expect(provider.verify).toHaveBeenCalledWith(expect.objectContaining({ primaryAnalysis: primary, correction }));
  });
});
